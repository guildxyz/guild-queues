import { v4 as uuidV4 } from "uuid";
import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";
import Worker from "./Worker";
import {
  AnyObject,
  FlowOptions,
  ILogger,
  IConnectable,
  RedisClient,
  WorkerFunction,
  IStartable,
  BaseJob,
  ArrayElement,
} from "./types";
import { objectToStringEntries, parseObject } from "../utils";
import ParentWorker from "./ParentWorker";
import { JOB_KEY_PREFIX } from "../static";

/**
 * Defines a sequence of Jobs / Queues / Workers
 */
export default class Flow<
  FlowQueueType extends BaseJob,
  CreateJobOptions extends AnyObject
> {
  /**
   * Name of the flow
   */
  public readonly name: string;

  /**
   * Provided logger (no logs if null)
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
  private workers: (IConnectable & IStartable)[] = [];

  /**
   * Options to create redis connections
   */
  private readonly redisClientOptions: RedisClientOptions;

  /**
   * Redis client instance
   */
  private readonly redis: RedisClient;

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
    const jobKey = `${JOB_KEY_PREFIX}:${this.name}:${jobId}`;

    const transaction = this.redis
      .multi()
      // create the job with the parameters
      .hSet(jobKey, objectToStringEntries(options));

    // add lookup keys
    this.lookupAttributes.forEach((la) => {
      if (typeof options[la] === "string" || typeof options[la] === "number") {
        // if attribute is primitive add one key
        transaction.rPush(
          `${JOB_KEY_PREFIX}:${this.name}:${la}:${options[la]}`,
          jobId
        );
      } else if (options[la] instanceof Array) {
        // if it's an array, add one for each element
        options[la].forEach((iterator: any) => {
          transaction.rPush(
            `${JOB_KEY_PREFIX}:${this.name}:${la}:${iterator}`,
            jobId
          );
        });
      }
    });

    // put to the first queue
    transaction.rPush(this.queues[0].waitingQueueKey, jobId);

    // execute transaction
    await transaction.exec();

    return jobId;
  };

  /**
   * Get jobs by ids
   * @param jobIds job ids
   * @returns jobs
   */
  private getJobs = async (jobIds: string[]) => {
    const transaction = this.redis.multi();
    jobIds.forEach((jobId) => {
      const jobKey = `${JOB_KEY_PREFIX}:${this.name}:${jobId}`;
      transaction.hGetAll(jobKey);
    });
    const flows = await transaction.exec();
    return flows.map((f) => parseObject(f as any));
  };

  /**
   * Get jobs by some Key
   * @param keyName name of the key
   * @param value value of the key
   * @returns jobs
   */
  public getJobsByKey = async (
    keyName: keyof CreateJobOptions,
    value: string | number
  ) => {
    // typecheck (necessary because CreateFlowOptions extends AnyObject)
    if (typeof keyName !== "string") {
      return [];
    }

    const jobIds = await this.redis.lRange(
      `${JOB_KEY_PREFIX}:${this.name}:${keyName}:${value}`,
      0,
      -1
    );
    return this.getJobs(jobIds);
  };

  public createWorker = <QueueType extends FlowQueueType = FlowQueueType>(
    queueName: QueueType["queueName"],
    workerFunction: WorkerFunction<QueueType["params"], QueueType["result"]>,
    lockTime?: number,
    waitTimeout?: number
  ): Worker<QueueType["params"], QueueType["result"]> => {
    const queue = this.queues.find((q) => q.name === queueName);

    const worker = new Worker<QueueType["params"], QueueType["result"]>({
      flowName: this.name,
      workerFunction,
      queue,
      lockTime,
      waitTimeout,
      redisClientOptions: this.redisClientOptions,
      logger: this.logger,
    });

    this.workers.push(worker);

    return worker;
  };

  public createParentWorker = <QueueType extends FlowQueueType = FlowQueueType>(
    queueName: QueueType["queueName"],
    lockTime?: number,
    waitTimeout?: number
  ): ParentWorker => {
    const queue = this.queues.find((q) => q.name === queueName);

    const worker = new ParentWorker({
      flowName: this.name,
      queue,
      lockTime,
      waitTimeout,
      redisClientOptions: this.redisClientOptions,
      logger: this.logger,
    });

    this.workers.push(worker);

    return worker;
  };

  public createChildWorker = <QueueType extends FlowQueueType = FlowQueueType>(
    parentQueueName: QueueType["queueName"],
    childName: ArrayElement<QueueType["children"]>["queueName"],
    workerFunction: WorkerFunction<QueueType["params"], QueueType["result"]>,
    lockTime?: number,
    waitTimeout?: number
  ): Worker<QueueType["params"], QueueType["result"]> => {
    const childQueueName = `${parentQueueName}:${childName}`;
    const queue = this.queues
      .find((q) => q.name === parentQueueName)
      .children.find((c) => c.name === childQueueName);

    const worker = new Worker<QueueType["params"], QueueType["result"]>({
      flowName: childQueueName,
      workerFunction,
      queue,
      lockTime,
      waitTimeout,
      redisClientOptions: this.redisClientOptions,
      logger: this.logger,
    });

    this.workers.push(worker);

    return worker;
  };

  public startAll = async () => {
    await this.connect();
    await Promise.all(this.workers.map((w) => w.connect()));
    await Promise.all(this.workers.map((w) => w.start()));
  };

  public stopAll = async () => {
    await Promise.all(this.workers.map((w) => w.stop()));
    await Promise.all(this.workers.map((w) => w.disconnect()));
    await this.disconnect();
  };
}
