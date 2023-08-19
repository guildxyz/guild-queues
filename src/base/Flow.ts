import { v4 as uuidV4 } from "uuid";
import { RedisClientOptions, createClient } from "redis";
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
import { keyFormatter, objectToStringEntries, parseObject } from "../utils";
import ParentWorker from "./ParentWorker";
import { DEFAULT_KEY_EXPIRY } from "../static";

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
    const jobId = uuidV4();
    const jobKey = keyFormatter.job(this.name, jobId);

    const transaction = this.redis
      .multi()
      // create the job with the parameters
      .hSet(jobKey, objectToStringEntries(options))
      .expire(jobKey, DEFAULT_KEY_EXPIRY);

    // add lookup keys
    this.lookupAttributes.forEach((lookupAttribute) => {
      if (
        typeof options[lookupAttribute] === "string" ||
        typeof options[lookupAttribute] === "number"
      ) {
        // if attribute is primitive add one key
        const key = keyFormatter.lookup(
          this.name,
          lookupAttribute,
          options[lookupAttribute]
        );
        transaction.rPush(key, jobId);
        transaction.expire(key, DEFAULT_KEY_EXPIRY);
      } else if (options[lookupAttribute] instanceof Array) {
        // if it's an array, add one for each element
        options[lookupAttribute].forEach((iterator: any) => {
          const key = keyFormatter.lookup(this.name, lookupAttribute, iterator);
          transaction.rPush(key, jobId);
          transaction.expire(key, DEFAULT_KEY_EXPIRY);
        });
      }
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
    this.lookupAttributes.forEach((lookupAttribute) => {
      if (
        typeof job[lookupAttribute] === "string" ||
        typeof job[lookupAttribute] === "number"
      ) {
        // if attribute is primitive remote the key
        const key = keyFormatter.lookup(
          this.name,
          lookupAttribute,
          job[lookupAttribute]
        );
        transaction.lRem(key, 1, jobId);
      } else if (job[lookupAttribute] instanceof Array) {
        // if it's an array, remote the lookup key for each element
        job[lookupAttribute].forEach((iterator: any) => {
          const key = keyFormatter.lookup(this.name, lookupAttribute, iterator);
          transaction.lRem(key, 1, jobId);
        });
      }
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
  private getJobs = async (jobIds: string[], resolveChildren: boolean) => {
    const transaction = this.redis.multi();
    jobIds.forEach((jobId) => {
      const jobKey = keyFormatter.job(this.name, jobId);
      transaction.hGetAll(jobKey);
    });
    const jobStrings = await transaction.exec();
    let jobs = jobStrings.map((j) => parseObject(j as any));

    if (resolveChildren) {
      // we need this many awaits here, because the async function is deeply nested
      jobs = await Promise.all(
        jobs.map(async (j) =>
          Object.fromEntries(
            await Promise.all(
              Object.entries(j).map(async ([key, value]) => {
                if (key.match(/^children:.*:jobs$/) && value instanceof Array) {
                  const children = (
                    await Promise.all(
                      value.map(async (v) => this.redis.hGetAll(v))
                    )
                  ).map((c) => parseObject(c));
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

    const jobs = await this.getJobs(jobIds, resolveChildren);
    return jobs.map((job, index) => ({ id: jobIds[index], ...job }));
  };

  /**
   * Create workers for a queue
   * @param queueName Name of the queue the worker will work on
   * @param workerFunction The function that will be executed on the jobs
   * @param count The number of workers to create
   * @param lockTime Expiration time of a job execution
   * @param waitTimeout Maximum number of seconds to wait for job before checking status
   * @returns The workers
   */
  public createWorkers = <QueueJob extends FlowJob = FlowJob>(
    queueName: QueueJob["queueName"],
    workerFunction: WorkerFunction<QueueJob["params"], QueueJob["result"]>,
    count: number,
    lockTime?: number,
    waitTimeout?: number
  ): Worker<QueueJob["params"], QueueJob["result"]>[] => {
    const queue = this.queues.find((q) => q.name === queueName);

    const createdWorkers: Worker<QueueJob["params"], QueueJob["result"]>[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new Worker<QueueJob["params"], QueueJob["result"]>({
        flowName: this.name,
        workerFunction,
        queue,
        lockTime,
        waitTimeout,
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
   * @param lockTime Expiration time of a job execution
   * @param waitTimeout Maximum number of seconds to wait for job before checking status
   * @returns The parent workers
   */
  public createParentWorkers = <QueueJob extends FlowJob = FlowJob>(
    queueName: QueueJob["queueName"],
    count: number,
    lockTime?: number,
    waitTimeout?: number
  ): ParentWorker[] => {
    const queue = this.queues.find((q) => q.name === queueName);

    const createdWorkers: ParentWorker[] = [];
    for (let i = 0; i < count; i += 1) {
      const worker = new ParentWorker({
        flowName: this.name,
        queue,
        lockTime,
        waitTimeout,
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
   * @param lockTime Expiration time of a job execution
   * @param waitTimeout Maximum number of seconds to wait for job before checking status
   * @returns The workers
   */
  public createChildWorkers = <QueueJob extends FlowJob = FlowJob>(
    parentQueueName: QueueJob["queueName"],
    childName: ArrayElement<QueueJob["children"]>["queueName"],
    workerFunction: WorkerFunction<QueueJob["params"], QueueJob["result"]>,
    count: number,
    lockTime?: number,
    waitTimeout?: number
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
        lockTime,
        waitTimeout,
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
