import { RedisClientOptions } from "redis";
import {
  AnyObject,
  ILogger,
  BaseJobParams,
  BaseJobResult,
} from "../base/types";

/**
 * Options to create flows in the AccessFlow
 */
export type CreateAccessJobOptions = {
  userId: number;
  roleIds: number[];
  guildId: number;
  priority: number;
  recheckAccess: boolean;
  updateMemberships: boolean;
  manageRewards: boolean;
  forceRewardActions: boolean;
  onlyForThisPlatform?: string;
};

/**
 * Options to create an AccessFlow instance
 */
export type AccessFlowOptions = {
  redisClientOptions: RedisClientOptions;
  logger: ILogger;
};

/**
 * A basic job of the access flow
 */
export type AccessParams = {
  id: string;
  userId: number;
  roleIds: number[];
};

/**
 * A basic result of the access flow
 */
export type AccessResult = {
  // eslint-disable-next-line no-use-before-define
  nextQueue?: AccessQueueJob["queueName"];
};

/**
 * Params of the preparation queue
 */
export type PreparationParams = AccessParams & { recheckAccess: boolean };

/**
 * Result of the preparation queue
 */
export type PreparationResult = AccessResult & {
  nextQueue: "access-check" | "update-membership";
};

/**
 * Params of the access-check queue
 */
export type AccessCheckParams = AccessParams & {
  updateMemberships: boolean;
};

/**
 * Result of the access-check queue
 */
export type AccessCheckResult = AccessResult & {
  accessCheckResult: {
    roleId: number;
    access: boolean;
    requirements: {
      requirementId: number;
      access: true;
      amount: number;
    }[];
  }[];
};

/**
 * Params of the update-membership queue
 */
export type UpdateMembershipParams = AccessParams &
  AccessCheckResult & {
    guildId: number;
    manageRewards: boolean;
  };

/**
 * Result of the update-membership queue
 */
export type UpdateMembershipResult = AccessResult & {
  updateMembershipResult: {
    newMembershipRoleIds: number[];
    lostMembershipRoleIds: number[];
    membershipRoleIds: number[];
    notMemberRoleIds: number[];
  };
};

/**
 * Basic properties of a manage reward action
 */
export type ManageRewardBase = {
  action: "ADD" | "REMOVE";
  platformId: number;
  platformUserId: string;
  platformGuildId: string;
  platformGuildData?: AnyObject;
  platformOwnerData?: AnyObject;
  platformRoles: {
    platformRoleId: string;
    platformRoleData?: AnyObject;
  }[];
};

/**
 * Params to create a manage-reward child job
 */
export type ManageRewardChildParams = {
  childName: string;
  manageRewardAction: ManageRewardBase; // nested, because this way we only need to HGET one field
};

/**
 * Manage reward child job params
 */
export type ManageRewardParams = BaseJobParams & {
  manageRewardAction: ManageRewardBase;
};

/**
 * Manage reward child result
 */
export type ManageRewardResult = BaseJobResult & {
  done: true;
  success: boolean;
  errorMsg?: string;
};

/**
 * Params of the prepare-manage-reward queue
 */
export type PrepareManageRewardParams = AccessParams &
  UpdateMembershipResult & {
    guildId: number;
    forceRewardActions: boolean;
    onlyForThisPlatform?: string;
  };

/**
 * Result of the prepare-manage-reward queue
 */
export type PrepareManageRewardResult = AccessResult & {
  nextQueue?: never;
  "children:manage-reward:params": ManageRewardChildParams[];
};

/**
 * Preparation job definition
 */
export type PreparationJob = {
  queueName: "preparation";
  children: [];
  params: PreparationParams;
  result: PreparationResult;
};

/**
 * AccessCheck job definition
 */
export type AccessCheckJob = {
  queueName: "access-check";
  params: AccessCheckParams;
  result: AccessCheckResult;
};

/**
 * UpdateMembership job definition
 */
export type UpdateMembershipJob = {
  queueName: "update-membership";
  children: [];
  params: UpdateMembershipParams;
  result: UpdateMembershipResult;
};

/**
 * PrepareManageReward job definition
 */
export type PrepareManageRewardJob = {
  queueName: "prepare-manage-reward";
  children: [];
  params: PrepareManageRewardParams;
  result: PrepareManageRewardResult;
};

/**
 * ManageReward job definition
 */
export type ManageRewardJob = {
  queueName: "manage-reward";
  children: [
    { queueName: "discord" },
    { queueName: "telegram" },
    { queueName: "github" },
    { queueName: "google" },
    { queueName: "nft" }
  ];
  params: ManageRewardParams;
  result: ManageRewardResult;
};

/**
 * AccessResult job definition
 */
export type AccessResultJob = {
  queueName: "access-result";
  children: [];
  params: AccessCheckParams;
  result: AccessCheckResult;
};

/**
 * Names of the queues in the access flow
 */
export type AccessQueueJob =
  | PreparationJob
  | AccessCheckJob
  | UpdateMembershipJob
  | PrepareManageRewardJob
  | ManageRewardJob
  | AccessResultJob;
