import { BaseJob, PrimaryResult } from "../types";

/**
 * Name of a child queue (<child job group>:<child job identifier>, e.g.: manage-reward:discord)
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
 * Key for the state which represents a child job (the last string represents the child job's uuid)
 */
export type ChildJobKey<ChildQueueName extends BaseChildQueueName> =
  `child:${ChildQueueName}:job:${string}`;
/**
 * Key for the state which represents a child job's result (the last string represents the child job's uuid)
 */
export type ChildResultKey<ChildQueueName extends BaseChildQueueName> =
  `child:${ChildQueueName}:result:${string}`;
/**
 * Count of the child jobs of a child job group (the middle string represents the child job group)
 */
export type ChildGroupAllCountKey = `child-group:${string}:count:all`;
/**
 * Count of the completed child jobs of a child job group (the middle string represents the child job group)
 */
export type ChildGroupDoneCountKey = `child-group:${string}:count:done`;
/**
 * Next primary queue to continue with after a child job group is finished (the middle string represents the child job group)
 */
export type ChildGroupNextQueueKey = `child-group:${string}:next-queue`;

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
  [key: ChildJobKey<BaseChildQueueName>]: any;
  /**
   * Count of the child jobs of a child job group
   */
  [key: ChildGroupAllCountKey]: number;
  /**
   * Count of the completed child jobs of a child job group
   */
  [key: ChildGroupDoneCountKey]: 0;
  /**
   * Next primary queue to continue with after a child job group is finished
   */
  [key: ChildGroupNextQueueKey]: QueueName;
};
