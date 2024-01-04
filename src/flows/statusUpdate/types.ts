import { BaseJobParams, ManagedJobFields } from "../../base/types";
import { DONE_FIELD } from "../../static";
import {
  AccessCheckChildParams,
  AccessCheckParams,
  AccessCheckResult,
  AccessFlowOptions,
  AccessFlowParams,
  AccessPreparationParams,
  AccessResultResult,
  CreateAccessJobOptions,
  ManageRewardChildParams,
  ManageRewardJob,
  ManageRewardParams,
  ManageRewardResult,
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
  nextQueue?: StatusUpdateFlowJob["queueName"];
};

export type StatusUpdatePreparationParams =
  StatusUpdatify<AccessPreparationParams>;

export type BulkAccessCheckChildParams = StatusUpdatify<AccessCheckChildParams>;

export type StatusUpdatePreparationResult = StatusUpdateFlowResult &
  (
    | {
        nextQueue: "bulk-access-check";
        "children:bulk-access-check:params": BulkAccessCheckChildParams[];
        "children:access-check:params": AccessCheckChildParams[];
      }
    | {
        nextQueue: "bulk-update-membership";
        "children:bulk-access-check:params"?: never;
        "children:access-check:params"?: never;
      }
  );

export type BulkAccessCheckParams = StatusUpdatify<AccessCheckParams> &
  BaseJobParams;

export type BulkAccessCheckResult = StatusUpdateFlowResult & {
  [DONE_FIELD]: true;
  requirementId: number;
  requirementError?: RequirementError;
  users: {
    userId: number;
    access: boolean;
    amount?: number;
    userLevelErrors?: RequirementError[];
  }[];
};

export type BulkAccessLogicParams = StatusUpdateFlowParams & {
  "children:access-check:jobs": string[];
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

export type StatusUpdateFlowJob =
  | StatusUpdatePreparationJob
  | BulkAccessCheckJob
  | BulkAccessLogicJob
  | BulkUpdateMembershipJob
  | BulkPrepareManageRewardJob
  | ManageRewardJob
  | StatusUpdateResultJob;

export type StatusUpdateLookupAttributes = "roleIds" | "guildId";

export type StatusUpdateJobContent = CreateStatusUpdateJobOptions &
  BaseJobParams &
  ManagedJobFields &
  StatusUpdateFlowResult &
  Omit<StatusUpdatePreparationResult, "nextQueue"> &
  Omit<BulkAccessCheckResult, "nextQueue"> &
  Omit<BulkAccessLogicResult, "nextQueue"> &
  Omit<BulkUpdateMembershipResult, "nextQueue"> &
  Omit<BulkPrepareManageRewardResult, "nextQueue"> &
  Omit<ManageRewardResult, "nextQueue"> &
  Omit<StatusUpdateResultResult, "nextQueue"> & {
    "children:access-check:jobs": (AccessCheckParams &
      AccessCheckResult &
      BaseJobParams &
      ManagedJobFields)[];
    "children:bulk-access-check:jobs": (BulkAccessCheckResult &
      BaseJobParams &
      ManagedJobFields)[];
    "children:manage-reward:jobs": (ManageRewardParams &
      ManageRewardResult &
      BaseJobParams &
      ManagedJobFields)[];
  };
