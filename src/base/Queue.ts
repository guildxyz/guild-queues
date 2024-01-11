/* eslint-disable no-use-before-define */
import { keyFormatter } from "../utils";
import { BaseJobParams, Limiter, QueueOptions } from "./types";

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
   * If the queue is part of multiple flows, it probably has multiple next queues
   * This map maps the flow names to the next queues
   */
  readonly nextQueueNameMap: Map<string, string>;

  readonly nextQueuePriorityDiffMap: Map<string, number>;

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
   * Upper boundary for calls in a giver interval
   */
  readonly limiter?: Limiter;

  /**
   * Number of priorities for this queue
   */
  readonly priorities: number;

  /**
   * Whether the job is expected to be delayed
   * The flow monitor uses this info
   * If it's true it will monitor the queue's delay queue as well
   */
  readonly delayable: boolean;

  /**
   * Number of retries before marking the job failed.
   */
  readonly maxRetries: number;

  /**
   * Sets the properties
   * @param options parameters of the queue
   */
  constructor(options: QueueOptions) {
    const {
      queueName,
      nextQueueName,
      nextQueueNameMap,
      attributesToGet,
      children,
      limiter,
      priorities,
      delayable,
      maxRetries,
      nextQueuePriorityDiffMap,
    } = options;

    // set properties
    this.name = queueName;
    this.limiter = limiter
      ? {
          reservoir: limiter.reservoir,
          intervalMs: limiter.intervalMs,
          id: limiter.id ?? queueName,
          groupJobKey: limiter.groupJobKey,
        }
      : undefined;
    this.attributesToGet = attributesToGet || [];
    this.priorities = priorities || 1;
    this.maxRetries = maxRetries || 0;
    this.delayable = delayable ?? false;
    this.nextQueueName = nextQueueName;
    this.nextQueueNameMap = nextQueueNameMap || new Map();
    this.nextQueuePriorityDiffMap = nextQueuePriorityDiffMap || new Map();

    // add default attributes (except the id which is always present because Worker.lease adds it to the job)
    const defaultAttributesToGet: (keyof BaseJobParams)[] = [
      "flowName",
      "priority",
      "correlationId",
    ];
    if (delayable) {
      defaultAttributesToGet.push("delay");
    }
    if (limiter?.groupJobKey) {
      defaultAttributesToGet.push(limiter.groupJobKey as any);
    }
    this.attributesToGet = [
      ...new Set([...this.attributesToGet, ...defaultAttributesToGet]),
    ];

    // init children
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
