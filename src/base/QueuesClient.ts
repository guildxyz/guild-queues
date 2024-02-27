import { RedisClientOptions, createClient } from "redis";
import {
  ArrayElement,
  ICorrelator,
  ILogger,
  RedisClient,
  WorkerFunction,
} from "./types";
import Worker from "./Worker";
import { FlowNames, FlowTypes } from "../flows/types";
import {
  generateJobId,
  getKeyExpirySec,
  getLookupKeys,
  keyFormatter,
  objectToStringEntries,
  parseObject,
} from "../utils";
import flows from "../flows/flows";
import ParentWorker from "./ParentWorker";

export default class QueuesClient {
  /**
   * Worker instances
   */
  public readonly workers: Worker<any, any>[] = [];

  /**
   * Options to create redis connections
   */
  private readonly redisClientOptions: RedisClientOptions;

  /**
   * Redis client instance
   */
  private readonly redis: RedisClient;

  /**
   * Provided logger
   */
  private readonly logger: ILogger;

  /**
   * Provided correlator
   */
  private readonly correlator: ICorrelator;

  constructor(options: {
    redisClientOptions: RedisClientOptions;
    logger: ILogger;
    correlator: ICorrelator;
  }) {
    const { logger, redisClientOptions } = options;

    this.logger = logger;
    this.redisClientOptions = redisClientOptions;
    this.redis = createClient(redisClientOptions);
    this.correlator = options.correlator;
  }

  /**
   * Connect to redis client
   */
  public connect = async () => {
    await this.redis.connect();
  };

  /**
   * Disconnect from redis client
   */
  public disconnect = async () => {
    await this.redis.disconnect();
  };

  /**
   * Connect and start all workers
   */
  public startAll = async () => {
    await this.connect();
    await Promise.all(this.workers.map((w) => w.connect()));
    await Promise.all(this.workers.map((w) => w.start()));
  };

  /**
   * Stop and disconnect all workers
   */
  public stopAll = async () => {
    await Promise.all(this.workers.map((w) => w.stop()));
    await Promise.all(this.workers.map((w) => w.disconnect()));
    await this.disconnect();
  };

  /**
   * Create a job and put it in the first queue
   * @param options parameters of the flow
   * @returns the job's id
   */
  // eslint-disable-next-line no-undef
  public createJob = async <FlowName extends FlowNames>(
    flowName: FlowName,
    options: FlowTypes[FlowName]["createJobOptions"]
  ): Promise<string> => {
    // generate id for the job
    const jobId = generateJobId(flowName);
    const jobKey = keyFormatter.job(jobId);
    const keyExpirySec = getKeyExpirySec(flowName);

    const transaction = this.redis
      .multi()
      // create the job with the parameters
      .hSet(
        jobKey,
        objectToStringEntries({
          ...options,
          flowName,
        })
      )
      .expire(jobKey, keyExpirySec);

    // add lookup keys
    const lookupKeys = getLookupKeys(
      flowName,
      options,
      flows[flowName].lookupAttributes
    );
    lookupKeys.forEach((lookupKey) => {
      transaction.rPush(lookupKey, jobId);
      transaction.expire(lookupKey, keyExpirySec);
    });

    // put to the first queue
    transaction.rPush(
      keyFormatter.waitingQueueName(
        flows[flowName].queues[0].name,
        options.priority
      ),
      jobId
    );

    // execute transaction
    await transaction.exec();

    return jobId;
  };

  public deleteJob = async <FlowName extends FlowNames>(
    flowName: FlowName,
    jobId: string
  ): Promise<number[]> => {
    // fetch the job
    const [job] = await this.getJobs([jobId], false);

    if (!job) {
      throw new Error("Job to delete does not exist.");
    }

    const transaction = this.redis.multi();

    // remove job from the the lookup keys
    const lookupKeys = getLookupKeys(
      flowName,
      job,
      flows[flowName].lookupAttributes
    );
    lookupKeys.forEach((lookupKey) => {
      transaction.lRem(lookupKey, 1, jobId);
    });

    // remove the job's hash
    const jobKey = keyFormatter.job(job.id);
    transaction.del(jobKey);

    // remove children
    const matcher = /^children:.*:jobs$/;
    Object.entries(job).forEach(([key, value]) => {
      if (key.match(matcher) && value instanceof Array) {
        value.forEach((childJobId) => {
          transaction.del(childJobId as string);
        });
      }
    });

    return transaction.exec() as Promise<number[]>; // necessary, unless throws: "The inferred type of 'deleteJob' cannot be named without a reference to"
  };

  /**
   * Get jobs by ids
   * @param jobIds job ids
   * @param resolveChildren whether include child jobs (not just their keys)
   * @returns jobs
   */
  public getJobs = async <FlowName extends FlowNames>(
    jobIds: string[],
    resolveChildren: boolean,
    keysToGet: (keyof FlowTypes[FlowName]["content"])[] = undefined
  ): Promise<FlowTypes[FlowName]["content"][]> => {
    const transaction = this.redis.multi();
    jobIds.forEach((jobId) => {
      const jobKey = keyFormatter.job(jobId);
      if (keysToGet) {
        transaction.hmGet(jobKey, keysToGet as string[]);
      } else {
        transaction.hGetAll(jobKey);
      }
    });
    const rawJobs = await transaction.exec();
    let jobs: Record<string, any>[] = rawJobs.map((rawJob, index) => {
      if (!keysToGet) {
        return {
          id: jobIds[index],
          ...parseObject(rawJob as any, this.logger),
        };
      }

      const rawJobObject = Object.fromEntries(
        keysToGet
          .map<[string, any]>((key, keyIndex) => [
            key as string,
            (rawJob as any)[keyIndex],
          ])
          .filter(([, value]) => value !== null)
      );
      return {
        id: jobIds[index],
        ...parseObject(rawJobObject, this.logger),
      };
    });

    // add more variables, separate code ***clean code***
    if (resolveChildren) {
      // we need this many awaits here, because the async function is deeply nested
      jobs = await Promise.all(
        // map all jobs
        jobs.map(async (j) =>
          // restore job object from property key-value pairs
          Object.fromEntries(
            // await getting children from redis
            await Promise.all(
              // job to key value pairs to check for children jobs keys
              Object.entries(j).map(async ([key, value]) => {
                // check if the key is a child jobs key
                if (key.match(/^children:.*:jobs$/) && value instanceof Array) {
                  const parentQueueChildIdPairs = value.map((v) => {
                    // the child job's "flow" the middle part is the parent queue's name
                    const parentQueueName = v.split(":").slice(1, -1).join(":");
                    // the childId is the flowName plus a uuid, so we cut the "job:" prefix
                    const childId = v.split(":").slice(1).join(":");

                    return { parentQueueName, childId };
                  });

                  const childIdsByParentQueueName = new Map<string, string[]>();
                  parentQueueChildIdPairs.forEach(
                    ({ parentQueueName, childId }) => {
                      const childIds =
                        childIdsByParentQueueName.get(parentQueueName) || [];
                      childIds.push(childId);
                      childIdsByParentQueueName.set(parentQueueName, childIds);
                    }
                  );

                  const children = await Promise.all(
                    Array.from(childIdsByParentQueueName.entries()).map(
                      ([, childIds]) => this.getJobs(childIds, true, keysToGet)
                    )
                  ).then((x) => x.flat());

                  return [key, children];
                }
                return [key, value];
              })
            )
          )
        )
      );
    }

    return jobs as FlowTypes[FlowName]["content"][]; // trust me bro
  };

  /**
   * Get jobs by some key
   * @param keyName name of the key
   * @param value value of the key
   * @param resolveChildren whether include child jobs (not just their keys)
   * @returns jobs
   */
  public getJobsByKey = async <FlowName extends FlowNames>(
    flowName: FlowName,
    keyName: FlowTypes[FlowName]["lookupAttributes"],
    value: string | number,
    resolveChildren: boolean,
    keysToGet: (keyof FlowTypes[FlowName]["content"])[] = undefined
  ): Promise<FlowTypes[FlowName]["content"][]> => {
    // typecheck (necessary because CreateFlowOptions extends AnyObject)
    if (typeof keyName !== "string") {
      return [];
    }

    const jobIds = await this.redis.lRange(
      keyFormatter.lookup(flowName, keyName, value),
      0,
      -1
    );

    return this.getJobs<FlowName>(jobIds, resolveChildren, keysToGet);
  };

  /**
   * Create workers for a queue
   * @param queueName Name of the queue the worker will work on
   * @param workerFunction The function that will be executed on the jobs
   * @param count The number of workers to create
   * @param lockTimeSec Expiration time of a job execution (seconds)
   * @param blockTimeoutSec Maximum number of seconds to wait for job before checking status (seconds)
   * @returns The workers
   */
  public createWorkers = <
    FlowName extends FlowNames,
    QueueJob extends FlowTypes[FlowName]["job"]
  >(
    flowName: FlowName,
    queueName: QueueJob["queueName"],
    workerFunction: WorkerFunction<QueueJob["params"], QueueJob["result"]>,
    count: number,
    lockTimeSec?: number,
    blockTimeoutSec?: number
  ): Worker<QueueJob["params"], QueueJob["result"]>[] => {
    const queue = flows[flowName].queues.find((q) => q.name === queueName);

    const createdWorkers: Worker<QueueJob["params"], QueueJob["result"]>[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker<QueueJob["params"], QueueJob["result"]>({
        workerFunction,
        queue,
        lockTimeSec,
        blockTimeoutSec,
        redisClientOptions: this.redisClientOptions,
        logger: this.logger,
        correlator: this.correlator,
      });
      createdWorkers.push(worker);
    }

    this.workers.push(...createdWorkers);

    return createdWorkers;
  };

  /**
   * Create parent workers for a queue which has children
   * @param queueName Name of the queue the worker will work on
   * @param count The number of workers to create
   * @param lockTimeSec Expiration time of a job execution (seconds)
   * @param blockTimeoutSec Maximum number of seconds to wait for job before checking status (seconds)
   * @returns The parent workers
   */
  public createParentWorkers = <
    FlowName extends FlowNames,
    QueueJob extends FlowTypes[FlowName]["job"]
  >(
    flowName: FlowName,
    queueName: QueueJob["queueName"],
    count: number,
    lockTimeSec?: number,
    blockTimeoutSec?: number
  ): ParentWorker[] => {
    const queue = flows[flowName].queues.find((q) => q.name === queueName);

    const createdParentWorkers: ParentWorker[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new ParentWorker({
        queue,
        lockTimeSec,
        blockTimeoutSec,
        redisClientOptions: this.redisClientOptions,
        logger: this.logger,
        correlator: this.correlator,
      });
      createdParentWorkers.push(worker);
    }

    this.workers.push(...createdParentWorkers);

    return createdParentWorkers;
  };

  /**
   * Create workers for a child queue
   * @param parentQueueName Name of the parent queue
   * @param childName Name of the child within the parent (parentQueueName+childName=childQueueName)
   * @param workerFunction The function that will be executed on the jobs
   * @param count The number of workers to create
   * @param lockTimeSec Expiration time of a job execution (seconds)
   * @param blockTimeoutSec Maximum number of seconds to wait for job before checking status (seconds)
   * @returns The workers
   */
  public createChildWorkers = <
    FlowName extends FlowNames,
    QueueJob extends FlowTypes[FlowName]["job"]
  >(
    flowName: FlowName,
    parentQueueName: QueueJob["queueName"],
    childName: ArrayElement<QueueJob["children"]>["queueName"],
    workerFunction: WorkerFunction<QueueJob["params"], QueueJob["result"]>,
    count: number,
    lockTimeSec?: number,
    blockTimeoutSec?: number
  ): Worker<QueueJob["params"], QueueJob["result"]>[] => {
    const childQueueName = keyFormatter.childQueueName(
      parentQueueName,
      childName
    );
    const queue = flows[flowName].queues
      .find((q) => q.name === parentQueueName)
      .children.find((c) => c.name === childQueueName);

    const createdWorkers: Worker<QueueJob["params"], QueueJob["result"]>[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker<QueueJob["params"], QueueJob["result"]>({
        workerFunction,
        queue,
        lockTimeSec,
        blockTimeoutSec,
        redisClientOptions: this.redisClientOptions,
        logger: this.logger,
        correlator: this.correlator,
      });
      createdWorkers.push(worker);
    }

    this.workers.push(...createdWorkers);

    return createdWorkers;
  };
}
