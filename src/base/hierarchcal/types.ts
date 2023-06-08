import { BaseJob, PrimaryResult } from "../types";

export type BaseChildQueueName = `${string}:${string}`;

export type BaseChildJob<ChildQueueName extends BaseChildQueueName> =
  BaseJob & {
    childId: string;
    parentId: string;
    childQueueName: ChildQueueName;
  };

export type BaseChildJobParams<ChildQueueName extends BaseChildQueueName> =
  Omit<BaseChildJob<ChildQueueName>, "id" | "parentId" | "childId">;

export type ParentResult<
  QueueName extends string,
  ChildQueueName extends BaseChildQueueName,
  ChildJobParams extends BaseChildJobParams<ChildQueueName>
> = PrimaryResult<QueueName> & {
  children: ChildJobParams[];
};

export type ResultChildKey = `child:job:${BaseChildQueueName}:${string}`;
export type FormattedParentResult<
  QueueName extends string,
  ChildQueueName extends BaseChildQueueName,
  ChildJobParam extends BaseChildJobParams<ChildQueueName>
> = ParentResult<QueueName, ChildQueueName, ChildJobParam> & {
  [key: ResultChildKey]: any;
  childCount?: number;
  childDoneCount?: 0;
};
