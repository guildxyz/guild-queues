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
   * Name of the next queue in the flow
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
   * e.g. userId, requirementId in access check
   * or platformUserId, platformGuildId in manage-reward
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
    const { queueName, nextQueueName, attributesToGet, children } = options;

    this.name = queueName;
    this.attributesToGet = attributesToGet || [];

    this.waitingQueueKey = keyFormatter.waitingQueueName(queueName);
    this.processingQueueKey = keyFormatter.processingQueueName(queueName);

    if (nextQueueName) {
      this.nextQueueName = nextQueueName;
      this.nextQueueKey = keyFormatter.waitingQueueName(nextQueueName);
    }

    this.children =
      children?.map(
        (c) =>
          new Queue({
            ...c,
            queueName: keyFormatter.childQueueName(queueName, c.queueName),
          })
      ) || [];
  }
}
