/* eslint-disable no-use-before-define */
import { LOCK_KEY_PREFIX, QUEUE_KEY_PREFIX } from "../static";
import { QueueOptions } from "./types";

/**
 * Stores a queue's properties
 */
export default class Queue {
  /**
   * Name of the queue
   */
  readonly name: string;

  /**
   * Name of the next queue
   */
  readonly nextQueueName: string;

  /**
   * Key of the queue where to put the result
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
  readonly lockKeyPrefix: string;

  /**
   * Job attributes to query when fetching a job
   */
  readonly attributesToGet: string[];

  /**
   * Child queues
   */
  readonly children: Queue[];

  /**
   * Sets the properties
   * @param options parameters of the queue
   */
  constructor(options: QueueOptions) {
    const { queueName, nextQueueName, attributesToGet } = options;

    this.name = queueName;
    this.attributesToGet = attributesToGet || [];

    this.waitingQueueKey = `${QUEUE_KEY_PREFIX}:${queueName}:waiting`;
    this.processingQueueKey = `${QUEUE_KEY_PREFIX}:${queueName}:processing`;
    this.lockKeyPrefix = `${LOCK_KEY_PREFIX}:${queueName}`;

    if (nextQueueName) {
      this.nextQueueName = nextQueueName;
      this.nextQueueKey = `${QUEUE_KEY_PREFIX}:${nextQueueName}:waiting`;
    }

    this.children =
      options.children?.map(
        (c) => new Queue({ ...c, queueName: `${queueName}:${c.queueName}` })
      ) || [];
  }
}
