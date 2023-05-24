import {
  BaseChildJob,
  BaseChildJobParams,
  ParentResult,
} from "../../base/hierarchcal/types";
import { AnyObject } from "../../base/types";
import { AccessJob, UpdateMembershipResult } from "../types";

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
