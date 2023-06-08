import { BaseJob, PrimaryResult } from "../types";

/**
 * Name of a child queue
 */
export type BaseChildQueueName = `${string}:${string}`;

/**
 * A minimal job that a ChildWorker can work with
 */
export type BaseChildJob<ChildQueueName extends BaseChildQueueName> =
  BaseJob & {
    /**
     * ID of the child job
     */
    childId: string;
    /**
     * ID of the parent flow state
     */
    parentId: string;
    /**
     * Name of the child queue
     */
    childQueueName: ChildQueueName;
  };

/**
 * Basic options for a child job
 */
export type BaseChildJobParams<ChildQueueName extends BaseChildQueueName> =
  Omit<BaseChildJob<ChildQueueName>, "id" | "parentId" | "childId">;

/**
 * Result of a ParentWorker which creates child jobs
 */
export type ParentResult<
  QueueName extends string,
  ChildQueueName extends BaseChildQueueName,
  ChildJobParams extends BaseChildJobParams<ChildQueueName>
> = PrimaryResult<QueueName> & {
  children: ChildJobParams[];
};

/**
 * Key for the state which represents a child job
 */
export type ResultChildKey = `child:job:${BaseChildQueueName}:${string}`;

/**
 * Processed, extended result of a parent worker
 */
export type FormattedParentResult<
  QueueName extends string,
  ChildQueueName extends BaseChildQueueName,
  ChildJobParam extends BaseChildJobParams<ChildQueueName>
> = ParentResult<QueueName, ChildQueueName, ChildJobParam> & {
  /**
   * Key for the state which represents a child job
   */
  [key: ResultChildKey]: any;
  /**
   * Count of the child jobs
   */
  childCount?: number;
  /**
   * Count of the completed child jobs
   */
  childDoneCount?: 0;
};
