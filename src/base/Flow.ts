import { RedisClientOptions, createClient } from "redis";
import { uuidv7 } from "uuidv7";
import Queue from "./Queue";
import Worker from "./Worker";
import {
  AnyObject,
  FlowOptions,
  ILogger,
  RedisClient,
  WorkerFunction,
  IStartable,
  BaseJob,
  ArrayElement,
  ICorrelator,
} from "./types";
import {
  getLookupKeys,
  keyFormatter,
  objectToStringEntries,
  parseObject,
} from "../utils";
import ParentWorker from "./ParentWorker";
import { DEFAULT_KEY_EXPIRY_SEC } from "../static";

/**
 * Defines a sequence of Jobs / Queues / Workers
 */
export default class Flow<
  FlowJob extends BaseJob,
  CreateJobOptions extends AnyObject,
  LookupAttributes extends keyof CreateJobOptions
> {
  /**
   * Name of the flow
   */
  public readonly name: string;

  /**
   * Provided logger
   */
  private readonly logger: ILogger;

  /**
   * Attributes which can be used for lookup a job
   */
  private readonly lookupAttributes: string[];

  /**
   * Queues of the Flow
   */
  private readonly queues: Queue[];

  /**
   * Workers of the Flow
   */
  private workers: IStartable[] = [];

  /**
   * Options to create redis connections
   */
  private readonly redisClientOptions: RedisClientOptions;

  /**
   * Redis client instance
   */
  private readonly redis: RedisClient;

  /**
   * Provided correlator
   */
  private readonly correlator: ICorrelator;

  /**
   * Set the basic options, initialize queues and redis client
   * @param options parameters of AccessFlow
   */
  constructor(options: FlowOptions) {
    const { name, logger, redisClientOptions, queueOptions, lookupAttributes } =
      options;

    this.name = name;
    this.logger = logger;
    this.lookupAttributes = lookupAttributes;
    this.redisClientOptions = redisClientOptions;
    this.redis = createClient(redisClientOptions);
    this.correlator = options.correlator;

    this.queues = queueOptions.map((qo) => new Queue(qo));
  }

  /**
   * Connect to redis client
   */
  private connect = async () => {
    await this.redis.connect();
  };

  /**
   * Disconnect from redis client
   */
  private disconnect = async () => {
    await this.redis.disconnect();
  };

  /**
   * Create a job and put it in the first queue
   * @param options parameters of the flow
   * @returns the job's id
   */
  public createJob = async (options: CreateJobOptions): Promise<string> => {
    // generate id for the job
    const jobId = uuidv7();
    const jobKey = keyFormatter.job(this.name, jobId);

    const transaction = this.redis
      .multi()
      // create the job with the parameters
      .hSet(
        jobKey,
        objectToStringEntries({
          ...options,
          correlationId: this.correlator.getId(),
        })
      )
      .expire(jobKey, DEFAULT_KEY_EXPIRY_SEC);

    // add lookup keys
    const lookupKeys = getLookupKeys(this.name, options, this.lookupAttributes);
    lookupKeys.forEach((lookupKey) => {
      transaction.rPush(lookupKey, jobId);
      transaction.expire(lookupKey, DEFAULT_KEY_EXPIRY_SEC);
    });

    // put to the first queue
    transaction.rPush(this.queues[0].waitingQueueKey, jobId);

    // execute transaction
    await transaction.exec();

    return jobId;
  };

  public deleteJob = async (jobId: string): Promise<number[]> => {
    // fetch the job
    const jobKey = keyFormatter.job(this.name, jobId);
    const jobRaw = await this.redis.hGetAll(jobKey);

    if (!jobRaw) {
      throw new Error("Job to delete does not exist.");
    }

    const job = parseObject(jobRaw);

    const transaction = this.redis.multi();
    const lookupKeys = getLookupKeys(this.name, job, this.lookupAttributes);
    lookupKeys.forEach((lookupKey) => {
      transaction.lRem(lookupKey, 1, jobId);
    });

    transaction.del(jobKey);

    return transaction.exec() as Promise<number[]>; // necessary, unless throws: "The inferred type of 'deleteJob' cannot be named without a reference to"
  };

  /**
   * Get jobs by ids
   * @param jobIds job ids
   * @param resolveChildren whether include child jobs (not just their keys)
   * @returns jobs
   */
  private getJobs = async (
    flowName: string,
    jobIds: string[],
    resolveChildren: boolean
  ) => {
    const transaction = this.redis.multi();
    jobIds.forEach((jobId) => {
      const jobKey = keyFormatter.job(flowName, jobId);
      transaction.hGetAll(jobKey);
    });
    const rawJobs = await transaction.exec();
    let jobs: Record<string, any>[] = rawJobs.map((rawJob, index) => ({
      id: jobIds[index],
      ...parseObject(rawJob as any),
    }));

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
                    // we need the last part, the uuid without the prefixes
                    const childId = v.split(":").pop();

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
                      ([parentQueueName, childIds]) =>
                        this.getJobs(parentQueueName, childIds, true)
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

    return jobs;
  };

  /**
   * Get jobs by some key
   * @param keyName name of the key
   * @param value value of the key
   * @param resolveChildren whether include child jobs (not just their keys)
   * @returns jobs
   */
  public getJobsByKey = async (
    keyName: LookupAttributes,
    value: string | number,
    resolveChildren: boolean
  ): Promise<Record<string, any>[]> => {
    // typecheck (necessary because CreateFlowOptions extends AnyObject)
    if (typeof keyName !== "string") {
      return [];
    }

    const jobIds = await this.redis.lRange(
      keyFormatter.lookup(this.name, keyName, value),
      0,
      -1
    );

    return this.getJobs(this.name, jobIds, resolveChildren);
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
  public createWorkers = <QueueJob extends FlowJob = FlowJob>(
    queueName: QueueJob["queueName"],
    workerFunction: WorkerFunction<QueueJob["params"], QueueJob["result"]>,
    count: number,
    lockTimeSec?: number,
    blockTimeoutSec?: number
  ): Worker<QueueJob["params"], QueueJob["result"]>[] => {
    const queue = this.queues.find((q) => q.name === queueName);

    const createdWorkers: Worker<QueueJob["params"], QueueJob["result"]>[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker<QueueJob["params"], QueueJob["result"]>({
        flowName: this.name,
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
  public createParentWorkers = <QueueJob extends FlowJob = FlowJob>(
    queueName: QueueJob["queueName"],
    count: number,
    lockTimeSec?: number,
    blockTimeoutSec?: number
  ): ParentWorker[] => {
    const queue = this.queues.find((q) => q.name === queueName);

    const createdWorkers: ParentWorker[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new ParentWorker({
        flowName: this.name,
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
   * Create workers for a child queue
   * @param parentQueueName Name of the parent queue
   * @param childName Name of the child within the parent (parentQueueName+childName=childQueueName)
   * @param workerFunction The function that will be executed on the jobs
   * @param count The number of workers to create
   * @param lockTimeSec Expiration time of a job execution (seconds)
   * @param blockTimeoutSec Maximum number of seconds to wait for job before checking status (seconds)
   * @returns The workers
   */
  public createChildWorkers = <QueueJob extends FlowJob = FlowJob>(
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
    const queue = this.queues
      .find((q) => q.name === parentQueueName)
      .children.find((c) => c.name === childQueueName);

    const createdWorkers: Worker<QueueJob["params"], QueueJob["result"]>[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker<QueueJob["params"], QueueJob["result"]>({
        flowName: childQueueName,
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
}
