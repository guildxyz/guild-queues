import { v4 as uuidV4 } from "uuid";
import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";
import {
  AnyObject,
  BaseJob,
  FlowOptions,
  ILogger,
  IConnectable,
  PrimaryResult,
  RedisClient,
  WorkerFunction,
  IStartable,
} from "./types";
import PrimaryWorker from "./primary/PrimaryWorker";
import ChildWorker from "./hierarchcal/ChildWorker";
import {
  BaseChildJob,
  BaseChildJobParams,
  ParentResult,
} from "./hierarchcal/types";
import { objectToStringEntries, parseObject } from "../utils";
import ParentWorker from "./hierarchcal/ParentWorker";

export default class Flow<
  QueueName extends string,
  ChildQueueName extends string,
  FlowJob extends BaseJob,
  FlowResult extends PrimaryResult<QueueName>,
  CreateFlowOptions extends AnyObject
> {
  /**
   * Prefix of the state key-value pair's keys
   */
  public readonly prefix: string;

  /**
   * Provided logger (no logs if null)
   */
  private readonly logger: ILogger;

  private readonly lookupAttributes: string[];

  private readonly queues: Queue<QueueName>[];

  private readonly childQueues: Queue<ChildQueueName>[];

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
  constructor(options: FlowOptions<QueueName, ChildQueueName>) {
    const {
      prefix,
      logger,
      redisClientOptions,
      queueOptions,
      childQueueNames,
      lookupAttributes,
    } = options;

    this.prefix = prefix;
    this.logger = logger;
    this.lookupAttributes = lookupAttributes;
    this.redisClientOptions = redisClientOptions;
    this.redis = createClient(redisClientOptions);

    this.queues = queueOptions.map((qo) => new Queue(qo));
    this.childQueues = childQueueNames.map(
      (cqn) => new Queue<ChildQueueName>({ queueName: cqn })
    );
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
   * Create an access flow and put it in the first queue
   * @param options parameters of the flow
   * @returns flow's id
   */
  public createFlow = async (options: CreateFlowOptions): Promise<string> => {
    // generate id for the flow
    const flowId = uuidV4();
    const flowKey = `${this.prefix}:${flowId}`;

    const transaction = this.redis
      .multi()
      // create the state with the parameters
      .hSet(flowKey, objectToStringEntries(options));

    // add lookup keys
    this.lookupAttributes.forEach((la) => {
      if (typeof options[la] === "string" || typeof options[la] === "number") {
        transaction.rPush(`${this.prefix}:${la}:${options[la]}`, flowId);
      } else if (options[la] instanceof Array) {
        options[la].forEach((iterator: any) => {
          transaction.rPush(`${this.prefix}:${la}:${iterator}`, flowId);
        });
      }
    });

    // put to the first queue
    transaction.rPush(this.queues[0].waitingQueueKey, flowId);

    // execute transaction
    await transaction.exec();

    return flowId;
  };

  /**
   * Get flow states by flowIds
   * @param flowIds flowIds to get
   * @returns flow states
   */
  private getFlows = async (flowIds: string[]) => {
    const transaction = this.redis.multi();
    flowIds.forEach((flowId) => {
      const flowKey = `${this.prefix}:${flowId}`;
      transaction.hGetAll(flowKey);
    });
    const flows = await transaction.exec();
    return flows.map((f) => parseObject(f as any));
  };

  /**
   * Get flow stated by some ids
   * @param keyName name of the id
   * @param value value of the id
   * @returns flow states
   */
  public getFlowsById = async (
    keyName: keyof CreateFlowOptions,
    value: string | number
  ) => {
    // typecheck (necessary because CreateFlowOptions extends AnyObject)
    if (typeof keyName !== "string") {
      return [];
    }

    const flowIds = await this.redis.lRange(
      `${this.prefix}:${keyName}:${value}`,
      0,
      -1
    );
    return this.getFlows(flowIds);
  };

  public createPrimaryWorker = <Job extends FlowJob, Result extends FlowResult>(
    queueName: QueueName,
    workerFunction: WorkerFunction<Job, Result>,
    lockTime?: number,
    waitTimeout?: number
  ): PrimaryWorker<QueueName, Job, Result> => {
    const queue = this.queues.find((q) => q.name === queueName);

    const worker = new PrimaryWorker<QueueName, Job, Result>({
      flowPrefix: this.prefix,
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

  public createParentWorker = <
    Job extends FlowJob,
    ChildJobParam extends BaseChildJobParams,
    Result extends ParentResult<QueueName, ChildJobParam>
  >(
    queueName: QueueName,
    workerFunction: WorkerFunction<Job, Result>,
    lockTime?: number,
    waitTimeout?: number
  ): ParentWorker<QueueName, Job, ChildJobParam, Result> => {
    const queue = this.queues.find((q) => q.name === queueName);

    const worker = new ParentWorker<QueueName, Job, ChildJobParam, Result>({
      flowPrefix: this.prefix,
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

  public createChildWorker = <ChildJob extends BaseChildJob, ChildResult>(
    childQueueName: ChildQueueName,
    workerFunction: WorkerFunction<ChildJob, ChildResult>,
    lockTime?: number,
    waitTimeout?: number
  ): ChildWorker<ChildQueueName, ChildJob, ChildResult> => {
    const childQueue = this.childQueues.find(
      (cq) => cq.name === childQueueName
    );

    const worker = new ChildWorker<ChildQueueName, ChildJob, ChildResult>({
      logger: this.logger,
      flowPrefix: this.prefix,
      queue: childQueue,
      redisClientOptions: this.redisClientOptions,
      workerFunction,
      lockTime,
      waitTimeout,
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
