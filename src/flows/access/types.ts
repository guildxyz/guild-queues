import { RedisClientOptions } from "redis";
import {
  AnyObject,
  ILogger,
  BaseJobParams,
  BaseJobResult,
  ICorrelator,
  ManagedJobFields,
} from "../../base/types";
import { DONE_FIELD } from "../../static";

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
  correlationId: string;
  shareSocials?: boolean;
  rootAuditLogId?: number;
};

/**
 * Options to create an AccessFlow instance
 */
export type AccessFlowOptions = {
  redisClientOptions: RedisClientOptions;
  logger: ILogger;
  correlator: ICorrelator;
};

/**
 * A basic job of the access flow
 */
export type AccessFlowParams = {
  id: string;
  flowName: "access";
  correlationId: string;
  priority: number;
  userId: number;
  guildId: number;
  roleIds: number[];
};

/**
 * A basic result of the access flow
 */
export type AccessFlowResult = {
  // eslint-disable-next-line no-use-before-define
  nextQueue?: AccessFlowJob["queueName"];
};

/**
 * Params of the access-preparation queue
 */
export type AccessPreparationParams = AccessFlowParams & {
  recheckAccess: boolean;
};

/**
 * Basic properties of requirementCheck
 */
export type AccessCheckChildParams = {
  childName: "requirement" | "covalent";
  userId: number;
  guildId: number;
  roleId: number;
  requirementId: number;
  priority: number;
};

/**
 * Result of the access-preparation queue
 */
export type AccessPreparationResult = AccessFlowResult &
  (
    | {
        nextQueue: "access-check";
        "children:access-check:params": AccessCheckChildParams[];
      }
    | {
        nextQueue: "update-membership";
        "children:access-check:params"?: never;
      }
  );

/**
 * Params of the access-check queue
 */
export type AccessCheckParams = BaseJobParams & {
  userId: number;
  guildId: number;
  roleId: number;
  requirementId: number;
};

export type RequirementError = {
  requirementId: number;
  msg: string;
  errorType: string;
  subType?: string;
};

/**
 * Result of the access-check queue
 */
export type AccessCheckResult = AccessFlowResult & {
  [DONE_FIELD]: true;
  requirementId: number;
  access: boolean;
  amount?: number;
  requirementError?: RequirementError;
  userLevelErrors?: RequirementError[];
};

/**
 * Params of the access-logic queue
 */
export type AccessLogicParams = AccessFlowParams & {
  "children:access-check:jobs": string[];
  updateMemberships: boolean;
};

export type RoleAccess = {
  roleId: number;
  access: boolean;
};

/**
 * Result of the access-logic queue
 */
export type AccessLogicResult = AccessFlowResult & {
  roleAccesses: RoleAccess[];
  nextQueue: "update-membership" | "access-result";
};

/**
 * Params of the update-membership queue
 */
export type UpdateMembershipParams = AccessFlowParams & {
  roleAccesses: RoleAccess[];
  manageRewards: boolean;
  shareSocials?: boolean;
  rootAuditLogId?: number;
};

/**
 * Result of the update-membership queue
 */
export type UpdateMembershipResult = AccessFlowResult & {
  updateMembershipResult: {
    newMembershipRoleIds: number[];
    lostMembershipRoleIds: number[];
    membershipRoleIds: number[];
    notMemberRoleIds: number[];
    roleIdAuditLogIdMap: Record<string, number>;
  };
};

/**
 * Basic properties of a manage reward action
 */
export type ManageRewardBase = {
  action: "ADD" | "REMOVE";
  platformId: number;
  platformUserId: string;
  platformUserData?: AnyObject;
  platformGuildId: string;
  platformGuildData?: AnyObject;
  platformOwnerData?: AnyObject;
  parentAuditLogIds?: {
    rolePlatformId: number;
    parentAuditLogId: number;
  }[];
  platformRoles: {
    platformRoleId: string;
    platformRoleData?: AnyObject;
  }[];
};

export type DataForRewardAuditLog = {
  userId: number;
  guildId: number;
  rolePlatforms: {
    roleId: number;
    rolePlatformId: number;
  }[];
};

/**
 * Params to create a manage-reward child job
 */
export type ManageRewardChildParams = {
  childName: string;
  priority: number;
  platformGuildId: string;
  manageRewardAction: ManageRewardBase; // nested, because this way we only need to HGET one field
  dataForAuditLog: DataForRewardAuditLog;
};

/**
 * Manage reward child job params
 */
export type ManageRewardParams = BaseJobParams & {
  platformGuildId: string;
  manageRewardAction: ManageRewardBase;
  dataForAuditLog: DataForRewardAuditLog;
};

/**
 * Manage reward child result
 */
export type ManageRewardResult = BaseJobResult & {
  [DONE_FIELD]: true;
  success: boolean;
  errorMsg?: string;
};

/**
 * Params of the prepare-manage-reward queue
 */
export type PrepareManageRewardParams = AccessFlowParams &
  UpdateMembershipResult & {
    forceRewardActions: boolean;
    onlyForThisPlatform?: string;
    rootAuditLogId?: number;
  };

/**
 * Result of the prepare-manage-reward queue
 */
export type PrepareManageRewardResult = AccessFlowResult & {
  nextQueue?: never;
  "children:manage-reward:params": ManageRewardChildParams[];
};

/**
 * Result of the access-result queue
 */
export type AccessResultResult = AccessFlowResult & {
  nextQueue?: never;
  [DONE_FIELD]: true;
};

/**
 * AccessPreparation job definition
 */
export type AccessPreparationJob = {
  queueName: "access-preparation";
  children: [];
  params: AccessPreparationParams;
  result: AccessPreparationResult;
};

/**
 * AccessCheck job definition
 */
export type AccessCheckJob = {
  queueName: "access-check";
  children: [{ queueName: "requirement" }, { queueName: "covalent" }];
  params: AccessCheckParams;
  result: AccessCheckResult;
};

/**
 * AccessLogic job definition
 */
export type AccessLogicJob = {
  queueName: "access-logic";
  children: [];
  params: AccessLogicParams;
  result: AccessLogicResult;
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
  params: BaseJobParams;
  result: AccessResultResult;
};

/**
 * Names of the queues in the access flow
 */
export type AccessFlowJob =
  | AccessPreparationJob
  | AccessCheckJob
  | AccessLogicJob
  | UpdateMembershipJob
  | PrepareManageRewardJob
  | ManageRewardJob
  | AccessResultJob;

export type AccessLookupAttributes = "userId" | "roleIds" | "guildId";

export type AccessJobContent = CreateAccessJobOptions &
  BaseJobParams &
  ManagedJobFields &
  AccessPreparationJob["result"] &
  AccessLogicJob["result"] &
  UpdateMembershipJob["result"] &
  PrepareManageRewardJob["result"] &
  ManageRewardJob["result"] &
  AccessResultJob["result"] & {
    "children:access-check:jobs": (AccessCheckResult &
      BaseJobParams &
      ManagedJobFields)[];
    "children:manage-reward:jobs": (ManageRewardResult &
      BaseJobParams &
      ManagedJobFields)[];
  };
