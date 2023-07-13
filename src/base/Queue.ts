/* eslint-disable no-use-before-define */
import { keyFormatter } from "../utils";
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

    this.waitingQueueKey = keyFormatter.waitingQueueName(queueName);
    this.processingQueueKey = keyFormatter.processingQueueName(queueName);

    if (nextQueueName) {
      this.nextQueueName = nextQueueName;
      this.nextQueueKey = keyFormatter.waitingQueueName(nextQueueName);
    }

    this.children =
      options.children?.map(
        (c) =>
          new Queue({
            ...c,
            queueName: keyFormatter.childQueueName(queueName, c.queueName),
          })
      ) || [];
  }
}
