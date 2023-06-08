import { BaseJob, PrimaryResult } from "../types";

// subQueueName:subJobId
export type ChildKey = `${string}:${string}`;
export type BaseChildJob = BaseJob & {
  childId: string /*  */;
  parentId: string;
  subQueueName: string;
};

export type BaseChildJobParams = Omit<
  BaseChildJob,
  "id" | "parentId" | "childId"
>;

export type ParentResult<
  QueueName extends string,
  ChildJobParams extends BaseChildJobParams
> = PrimaryResult<QueueName> & {
  children: ChildJobParams[];
};

export type FormattedParentResult<
  QueueName extends string,
  ChildJobParam extends BaseChildJobParams
> = ParentResult<QueueName, ChildJobParam> & {
  [key: ChildKey]: any;
  childCount?: number;
  childDoneCount?: 0;
};
