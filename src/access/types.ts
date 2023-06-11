import { RedisClientOptions } from "redis";
import { AnyObject, ILogger, PrimaryResult } from "../base/types";
import {
  ParentResult,
  BaseChildJobParams,
  BaseChildJob,
} from "../base/hierarchical/types";

/**
 * Names of the queues in the access flow
 */
export type AccessQueueName =
  | "preparation"
  | "access-check"
  | "update-membership"
  | "prepare-manage-reward"
  | "access-result";

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
  logger?: ILogger;
};

/**
 * A basic job of the access flow
 */
export type AccessJob = {
  id: string;
  userId: number;
  roleIds: number[];
};

/**
 * A basic result of the access flow
 */
export type AccessResult = PrimaryResult<AccessQueueName>;

/**
 * Job of the preparation queue
 */
export type PreparationJob = AccessJob & { recheckAccess: boolean };

/**
 * Result of the preparation queue
 */
export type PreparationResult = AccessResult & {
  nextQueue: "access-check" | "update-membership";
};

/**
 * Job of the access-check queue
 */
export type AccessCheckJob = AccessJob & {
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
 * Job of the update-membership queue
 */
export type UpdateMembershipJob = AccessJob &
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
 * Name of a manage-reward child queue
 */
export type ManageRewardQueueName = `manage-reward:${string}`;

/**
 * Params to create a manage-reward child job
 */
export type ManageRewardParams = BaseChildJobParams<ManageRewardQueueName> &
  ManageRewardBase;

/**
 * Manage reward child job
 */
export type ManageRewardJob = BaseChildJob<ManageRewardQueueName> &
  ManageRewardBase;

/**
 * Manage reward child result
 */
export type ManageRewardResult = {
  success: boolean;
  errorMsg?: string;
};

/**
 * Job of the prepare-manage-reward queue
 */
export type PrepareManageRewardJob = AccessJob &
  UpdateMembershipResult & {
    guildId: number;
    forceRewardActions: boolean;
    onlyForThisPlatform?: string;
  };

/**
 * Result of the prepare-manage-reward queue
 */
export type PrepareManageRewardResult = ParentResult<
  AccessQueueName,
  ManageRewardQueueName,
  ManageRewardParams
>;
