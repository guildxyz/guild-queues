import { BaseJobParams } from "../../base/types";
import { DONE_FIELD } from "../../static";
import {
  AccessCheckChildParams,
  AccessCheckParams,
  AccessFlowOptions,
  AccessFlowParams,
  AccessPreparationParams,
  AccessResultResult,
  CreateAccessJobOptions,
  ManageRewardChildParams,
  ManageRewardJob,
  RequirementError,
} from "../access/types";

/* ------------------------------- util types ------------------------------- */

type StatusUpdatify<T> = Omit<T, "userId"> & { userIds: number[] };

/* --------------------------------- options -------------------------------- */

export type CreateStatusUpdateJobOptions =
  StatusUpdatify<CreateAccessJobOptions>;

export type StatusUpdateFlowOptions = AccessFlowOptions;

/* --------------------------- params and results --------------------------- */

export type StatusUpdateFlowParams = Omit<
  AccessFlowParams,
  "userId" | "flowName"
> & { flowName: "status-update" };

export type StatusUpdateFlowResult = {
  // eslint-disable-next-line no-use-before-define
  nextQueue?: StatusUpdateJob["queueName"];
};

export type StatusUpdatePreparationParams =
  StatusUpdatify<AccessPreparationParams>;

export type BulkAccessCheckChildParams = StatusUpdatify<AccessCheckChildParams>;

export type StatusUpdatePreparationResult = StatusUpdateFlowResult &
  (
    | {
        nextQueue: "bulk-access-check";
        "children:bulk-access-check:params": BulkAccessCheckChildParams[];
      }
    | {
        nextQueue: "bulk-update-membership";
      }
  );

export type BulkAccessCheckParams = StatusUpdatify<AccessCheckParams> &
  BaseJobParams;

export type BulkAccessCheckResult = StatusUpdateFlowResult & {
  [DONE_FIELD]: true;
  requirementId: number;
  errors?: RequirementError[];
  users: {
    userId: number;
    access: boolean;
    amount?: number;
    warning?: RequirementError;
    error?: RequirementError;
  }[];
};

export type BulkAccessLogicParams = StatusUpdateFlowParams & {
  "children:bulk-access-check:jobs": string[];
  updateMemberships: boolean;
};

type RoleAccess = {
  roleId: number;
  access: boolean;
};

export type UserRoleAccess = {
  userId: number;
  roleAccesses: RoleAccess[];
};

export type BulkAccessLogicResult = StatusUpdateFlowResult & {
  userRoleAccesses: UserRoleAccess[];
  nextQueue: "bulk-update-membership" | "status-update-result";
};

export type BulkUpdateMembershipParams = StatusUpdateFlowParams & {
  userRoleAccesses: UserRoleAccess[];
  manageRewards: boolean;
};

export type BulkUpdateMembershipResult = StatusUpdateFlowResult & {
  bulkUpdateMembershipResult: {
    userId: number;
    newMembershipRoleIds: number[];
    lostMembershipRoleIds: number[];
    membershipRoleIds: number[];
    notMemberRoleIds: number[];
  }[];
};

export type BulkPrepareManageRewardParams = StatusUpdateFlowParams &
  BulkUpdateMembershipResult & {
    forceRewardActions: boolean;
    onlyForThisPlatform?: string;
  };

export type BulkPrepareManageRewardResult = StatusUpdateFlowResult & {
  nextQueue?: never;
  "children:manage-reward:params": ManageRewardChildParams[];
};

export type StatusUpdateResultResult = AccessResultResult;

/* ---------------------------------- jobs ---------------------------------- */

export type StatusUpdatePreparationJob = {
  queueName: "status-update-preparation";
  children: [];
  params: StatusUpdatePreparationParams;
  result: StatusUpdatePreparationResult;
};

export type BulkAccessCheckJob = {
  queueName: "bulk-access-check";
  children: [{ queueName: "requirement" }];
  params: BulkAccessCheckParams;
  result: BulkAccessCheckResult;
};

export type BulkAccessLogicJob = {
  queueName: "bulk-access-logic";
  children: [];
  params: BulkAccessLogicParams;
  result: BulkAccessLogicResult;
};

export type BulkUpdateMembershipJob = {
  queueName: "bulk-update-membership";
  children: [];
  params: BulkUpdateMembershipParams;
  result: BulkUpdateMembershipResult;
};

export type BulkPrepareManageRewardJob = {
  queueName: "bulk-prepare-manage-reward";
  children: [];
  params: BulkPrepareManageRewardParams;
  result: BulkPrepareManageRewardResult;
};

export type StatusUpdateResultJob = {
  queueName: "status-update-result";
  children: [];
  params: BaseJobParams;
  result: AccessResultResult;
};

export type StatusUpdateJob =
  | StatusUpdatePreparationJob
  | BulkAccessCheckJob
  | BulkAccessLogicJob
  | BulkUpdateMembershipJob
  | BulkPrepareManageRewardJob
  | ManageRewardJob
  | StatusUpdateResultJob;

export type StatusUpdateLookupAttributes = "userIds" | "roleIds" | "guildId";
