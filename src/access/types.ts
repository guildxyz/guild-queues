import { RedisClientOptions } from "redis";
import { ILogger, PrimaryResult } from "../base/types";

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

// Jobs and results

export type AccessJob = {
  id: string;
  userId: number;
  roleIds: number[];
};

export type AccessResult = PrimaryResult<AccessQueueName>;

export type PreparationJob = AccessJob & { recheckAccess: boolean };

export type PreparationResult = AccessResult & {
  nextQueue: "access-check" | "update-membership";
};

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
