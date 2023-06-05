import { RedisClientOptions } from "redis";
import { AnyObject, ILogger, PrimaryResult } from "../base/types";
import {
  ParentResult,
  BaseChildJobParams,
  BaseChildJob,
} from "../base/hierarchcal/types";

// Aliases

export type AccessQueueName =
  | "preparation"
  | "access-check"
  | "update-membership"
  | "prepare-manage-reward"
  | "response";

// Options

export type CreateAccessFlowOptions = {
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

export type AccessFlowOptions = {
  redisClientOptions: RedisClientOptions;
  logger?: ILogger;
};

// Jobs and results //

export type AccessJob = {
  id: string;
  userId: number;
  roleIds: number[];
};

export type AccessResult = PrimaryResult<AccessQueueName>;

// preparation

export type PreparationJob = AccessJob & { recheckAccess: boolean };

export type PreparationResult = AccessResult & {
  nextQueue: "access-check" | "update-membership";
};

// access-check

export type AccessCheckJob = AccessJob & {
  updateMemberships: boolean;
};

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

// update-membership

export type UpdateMembershipJob = AccessJob &
  AccessCheckResult & {
    guildId: number;
    manageRewards: boolean;
  };

export type UpdateMembershipResult = AccessResult & {
  updateMembershipResult: {
    newMembershipRoleIds: number[];
    lostMembershipRoleIds: number[];
    membershipRoleIds: number[];
    notMemberRoleIds: number[];
  };
};

// manage-reward

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

export type ManageRewardParams = BaseChildJobParams & ManageRewardBase;

export type ManageRewardJob = BaseChildJob & ManageRewardBase;

// prepare-manage-reward

export type PrepareManageRewardJob = AccessJob &
  UpdateMembershipResult & {
    guildId: number;
    forceRewardActions: boolean;
    onlyForThisPlatform?: string;
  };

export type PrepareManageRewardResult = ParentResult<
  string,
  ManageRewardParams
>;
