import { v4 as uuidV4 } from "uuid";
import { RedisClientOptions, createClient } from "redis";
import {
  FlowOptions,
  FlowId,
  AccessCheckJob,
  AccessCheckResult,
  PreparationJob,
  AccessFlowOptions,
  WorkerFunction,
  PreparationResult,
  RedisClient,
} from "../types";
import Queue from "./Queue";
import Worker from "./Worker";
import { hSetMore } from "../utils";

/**
 * Class to store queues, instantiate workers, and create flows
 */
export default class AccessFlow {
  /**
   * Prefix of the state key-value pair's keys
   */
  static flowPrefix: string = "flow";

  /**
   * Default state attributes to query when fetching a job
   */
  static defaultAttributesToGet: string[] = ["userId", "roleIds"];

  /**
   * Preparation queue instance
   */
  readonly preparationQueue: Queue;

  /**
   * Access-check queue instance
   */
  readonly accessCheck: Queue;

  /**
   * Options to create redis connections
   */
  readonly redisClientOptions: RedisClientOptions;

  /**
   * Redis client instance
   */
  private redis: RedisClient;

  /**
   * Set the basic options, initialize queues and redis client
   * @param options parameters of AccessFlow
   */
  constructor(options: AccessFlowOptions) {
    this.redisClientOptions = options.redisClientOptions;
    this.redis = createClient(options.redisClientOptions);

    this.preparationQueue = new Queue({
      queueName: "preparation",
      attributesToGet: [...AccessFlow.defaultAttributesToGet, "recheckAccess"],
    });
    this.accessCheck = new Queue({
      queueName: "access-check",
      attributesToGet: [
        ...AccessFlow.defaultAttributesToGet,
        "updateMemberships",
      ],
    });
  }

  /**
   * Connect to redis client
   */
  connect = async () => {
    await this.redis.connect();
  };

  /**
   * Disconnect from redis client
   */
  disconnect = async () => {
    await this.redis.disconnect();
  };

  /**
   * Create an access flow and put it in the first queue
   * @param options parameters of the flow
   * @returns flow's id
   */
  createFlow = async (options: FlowOptions): Promise<FlowId> => {
    const flowId = uuidV4();
    const flowKey = `${AccessFlow.flowPrefix}:${flowId}`;
    await hSetMore(this.redis, flowKey, options);
    await this.redis.rPush(this.preparationQueue.waitingQueueKey, flowId);
    return flowId;
  };

  /**
   * Get a preparation worker instance
   * @param lockTime a job will be locked for this amount of time
   * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
   * @returns Worker instance
   */
  getPreparationWorker = (
    workerFunction: WorkerFunction<PreparationJob, PreparationResult>,
    lockTime?: number,
    waitTimeout?: number
  ): Worker<PreparationJob, PreparationResult> =>
    new Worker({
      queue: this.preparationQueue,
      redisClientOptions: this.redisClientOptions,
      workerFunction,
      lockTime,
      waitTimeout,
    });

  /**
   * Get an access-check worker instance
   * @param lockTime a job will be locked for this amount of time
   * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
   * @returns Worker instance
   */
  getAccessCheckWorker = (
    workerFunction: WorkerFunction<AccessCheckJob, AccessCheckResult>,
    lockTime?: number,
    waitTimeout?: number
  ): Worker<AccessCheckJob, AccessCheckResult> =>
    new Worker({
      queue: this.accessCheck,
      redisClientOptions: this.redisClientOptions,
      workerFunction,
      lockTime,
      waitTimeout,
    });
}
