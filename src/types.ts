import { createClient } from "redis";

// Interfaces

interface ILogMethod {
  (message: string, meta?: any): any;
}

export interface ILogger {
  debug: ILogMethod;
  error: ILogMethod;
  warn: ILogMethod;
  info: ILogMethod;
  verbose: ILogMethod;
}

// Aliases

export type RedisClient = ReturnType<typeof createClient>;

export type FlowId = string;

export type AnyObject = { [key: string]: any };

// Options

export type QueueOptions = {
  redisClient: RedisClient;
  queueName: string;
  nextQueueName?: string;
  logger?: ILogger;
  lockTime?: number;
  attributesToGet: string[];
};

export type QueueFactoryOptions = {
  redisClient: RedisClient;
  logger?: ILogger;
  lockTime?: number;
};

// Jobs and Results

export type BaseJob = {
  flowId: FlowId;
  userId: number;
  roleIds: number[];
};

export type PreparationJob = BaseJob & { recheckAccess: boolean };

export type AccessCheckJob = BaseJob & {
  updateMemberships: boolean;
};

export type AccessCheckResult = {
  roleId: number;
  access: boolean;
  requirements: {
    requirementId: number;
    access: true;
    amount: number;
  }[];
}[];

export type UpdateMembershipJob = AccessCheckResult;

export type UpdateMembershipResult = number[];

export type ManageRewardJob = number[];

// export type ManageRewardResult =

export type FlowOptions = {
  userId: number;
  roleIds: number[];
  priority: number;
  recheckAccess: boolean;
  updateMemberships: boolean;
  manageRewards: boolean;
  forceRewardActions: boolean;
  onlyForThisPlatform?: string;
};

export type FlowData = FlowOptions & {
  status: "waiting" | "preparation done" | "access check done";
  accessCheckResult?: AccessCheckResult;
  updateMembershipResult?: UpdateMembershipResult;
};
