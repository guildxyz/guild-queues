import { QueueOptions } from "../types";

/**
 * Stores a queue's properties
 */
export default class Queue {
  /**
   * Prefix of the queue keys
   */
  static keyPrefix = "queue";

  /**
   * Name of the queue
   */
  readonly name: string;

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
   * State attributes to query when fetching a job
   */
  readonly attributesToGet: string[];

  /**
   * Sets the properties
   * @param options parameters of the queue
   */
  constructor(options: QueueOptions) {
    const { queueName, nextQueueName, attributesToGet } = options;

    this.name = queueName;
    this.attributesToGet = attributesToGet;

    this.waitingQueueKey = `${Queue.keyPrefix}:${queueName}:waiting`;
    this.processingQueueKey = `${Queue.keyPrefix}:${queueName}:processing`;
    this.lockPrefixKey = `${Queue.keyPrefix}:${queueName}:lock`;

    if (nextQueueName) {
      this.nextQueueKey = `${Queue.keyPrefix}:${nextQueueName}:waiting`;
    }
  }
}
