import { v4 as uuidV4 } from "uuid";
import { HasId, ILogger, QueueClientOptions, RedisClient } from "./types";
import { deserialize, hash, serialize } from "./utils";

/**
 * Interface for Guild redis queue management
 */
export default class QueueClient<Item = HasId, Result = HasId> {
  /**
   * Redis instance
   */
  private redis: RedisClient;

  /**
   * Provided logger (no logs if null)
   */
  private logger: ILogger;

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

  /**
   * Prefix of the lock key in redis
   */
  readonly lockPrefixKey: string;

  /**
   * Expiration time of lock keys
   */
  lockTime: number;

  /**
   * Sets the workerId, key names, other properties
   * @param options parameters of the queue
   */
  constructor(options: QueueClientOptions) {
    const defaultValues = {
      lockTime: 60 * 3,
      keyPrefix: "queue",
    };

    const {
      redisClient,
      queueName,
      nextQueueName,
      logger,
      lockTime,
      keyPrefix,
    } = {
      ...defaultValues,
      ...options,
    };

    this.redis = redisClient;
    this.logger = logger;
    this.queueName = queueName;
    this.lockTime = lockTime;
    this.workerId = uuidV4();

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
   * Add an item to the queue
   * @param item item to add
   */
  async add(item: Item): Promise<void> {
    await this.redis.rPush(this.waitingQueueKey, serialize<Item>(item));
  }

  async addBulk(items: Item[]): Promise<void> {
    await this.redis.rPush(
      this.waitingQueueKey,
      items.map((i) => serialize<Item>(i))
    );
  }

  /**
   * Dequeue an item from the queue
   * @returns the dequeued item
   */
  async lease(): Promise<Item> {
    const itemString = await this.redis.blMove(
      this.waitingQueueKey,
      this.processingQueueKey,
      "LEFT",
      "RIGHT",
      0
    );

    const item = deserialize<Item>(itemString);

    const itemHash = hash(item);
    const itemLockKey = `${this.lockPrefixKey}:${itemHash}`;
    await this.redis.set(itemLockKey, this.workerId, {
      EX: this.lockTime,
    });

    return item;
  }

  /**
   * Remove item from the queue and add the job's result to the next queue
   * @param item the item to mark as complete
   * @param result the result of the job
   * @returns whether the item was in the queue
   */
  async complete(item: Item, result: Result): Promise<boolean> {
    const itemHash = hash(item);
    const itemLockKey = `${this.lockPrefixKey}:${itemHash}`;
    const serializedItem = serialize<Item>(item);
    const serializedResult = serialize<Result>(result);

    const [_, removedItemCount, removedLockCount] = await this.redis
      .multi()
      .rPush(this.nextQueueKey, serializedResult)
      .lRem(this.processingQueueKey, 1, serializedItem)
      .del(itemLockKey)
      .exec();

    if (+removedItemCount > 0) {
      this.logger?.debug("complete succeed", { removedLockCount });
      return true;
    }

    // if the item was not present in the list (inconsistency) remove from next queue
    const abortResult = await this.redis.lRem(
      this.nextQueueKey,
      -1,
      serializedResult
    );

    this.logger?.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        name: this.queueName,
        processingQueueKey: this.processingQueueKey,
        item,
        abortResult,
      }
    );

    return false;
  }

  /**
   * Remove item from the queue
   * @param item the item to remove
   * @returns whether the item was in the queue
   */
  async remove(item: Item): Promise<boolean> {
    const itemHash = hash(item);
    const itemLockKey = `${this.lockPrefixKey}:${itemHash}`;
    const serializedItem = serialize<Item>(item);

    const [removedItemCount, removedLockCount] = await Promise.all([
      this.redis.lRem(this.processingQueueKey, 1, serializedItem),
      this.redis.del(itemLockKey),
    ]);

    if (removedItemCount === 1) {
      this.logger?.debug("remove succeed", { removedLockCount });
      return true;
    }

    this.logger?.warn(
      `inconsistency in remove(), item not found in processing queue`,
      {
        name: this.queueName,
        processingQueueKey: this.processingQueueKey,
        item,
      }
    );

    return false;
  }
}
