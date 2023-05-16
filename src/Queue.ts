import { v4 as uuidV4 } from "uuid";
import { BaseJob, FlowId, QueueOptions } from "./types";
import QueueBaseClient from "./QueueBaseClient";

/**
 * Stores queue info and methods for workers
 */
export default class Queue<
  Job extends BaseJob,
  Result
> extends QueueBaseClient {
  /**
   * Uuid of the worker
   */
  readonly workerId: string;

  /**
   * Name of the queue
   */
  readonly queueName: string;

  /**
   * Name of the queue where to put the result
   */
  readonly nextQueueKey?: string;

  /**
   * Redis key of the waiting queue
   */
  readonly waitingQueueKey: string;

  /**
   * Redis key of the processing queue
   */
  readonly processingQueueKey: string;

  readonly attributesToGet: string[];

  /**
   * Prefix of the lock key in redis
   */
  readonly lockPrefixKey: string;

  /**
   * Sets the workerId, key names, other properties
   * @param options parameters of the queue
   */
  constructor(options: QueueOptions) {
    super(options);

    const defaultValues = {
      lockTime: 60 * 3,
      attributesToGet: [] as string[],
    };

    const {
      redisClient,
      queueName,
      nextQueueName,
      logger,
      lockTime,
      attributesToGet,
    } = {
      ...defaultValues,
      ...options,
    };

    this.redis = redisClient;
    this.logger = logger;
    this.queueName = queueName;
    this.lockTime = lockTime;
    this.workerId = uuidV4();
    this.attributesToGet = ["userId", "roleIds", ...attributesToGet];

    const keyPrefix = "queue";
    this.waitingQueueKey = `${keyPrefix}:${queueName}:waiting`;
    this.processingQueueKey = `${keyPrefix}:${queueName}:processing`;
    this.lockPrefixKey = `${keyPrefix}:${queueName}:lock`;

    if (nextQueueName) {
      this.nextQueueKey = `${keyPrefix}:${nextQueueName}:waiting`;
    }

    logger?.info(`QueueClient initialized`, {
      queueName,
      keyPrefix,
      nextQueueName,
      workerId: this.workerId,
    });
  }

  /**
   * Marks a job as processed and returns it
   * @returns the job
   */
  async lease(): Promise<Job> {
    const flowId: FlowId = await this.redis.blMove(
      this.waitingQueueKey,
      this.processingQueueKey,
      "LEFT",
      "RIGHT",
      0
    );

    const itemLockKey = `${this.lockPrefixKey}:${flowId}`;
    await this.redis.set(itemLockKey, this.workerId, {
      EX: this.lockTime,
    });

    const flowKey = `flow:${flowId}`;
    const attributes = await this.hGetMore(flowKey, this.attributesToGet);

    return { flowId, ...attributes } as Job;
  }

  /**
   * @param item the item to mark as complete
   * @param result the result of the job
   * @returns whether the item was in the queue
   */

  /**
   * Updates the flow's status, removed the specified job from the queue and adds it to the next one
   * @param flowId the job's flow id
   * @param result the result of the job
   * @param nextQueue the next queue
   * @returns whether it was successful
   */
  async complete(
    flowId: FlowId,
    result?: Result,
    nextQueue?: string
  ): Promise<boolean> {
    const flowKey = `flow:${flowId}`;

    if (result) {
      await this.hSetAll(flowKey, result);
    }

    const itemLockKey = `${this.lockPrefixKey}:${flowId}`;
    const nextQueueKey = nextQueue
      ? `queue:${nextQueue}:waiting`
      : this.nextQueueKey;

    const [_, removedItemCount, removedLockCount] = await this.redis
      .multi()
      .rPush(nextQueueKey, flowId)
      .lRem(this.processingQueueKey, 1, flowId)
      .del(itemLockKey)
      .exec();

    if (+removedItemCount > 0) {
      this.logger?.debug("complete succeed", { removedLockCount });
      return true;
    }

    // if the item was not present in the list (inconsistency) remove from next queue
    const abortResult = await this.redis.lRem(this.nextQueueKey, -1, flowId);

    this.logger?.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        name: this.queueName,
        processingQueueKey: this.processingQueueKey,
        flowId,
        abortResult,
      }
    );

    return false;
  }
}
