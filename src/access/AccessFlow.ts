import Flow from "../base/Flow";
import { QueueOptions } from "../base/types";
import {
  AccessFlowOptions,
  AccessJob,
  AccessQueueName,
  AccessResult,
  CreateAccessFlowOptions,
  ManageRewardQueueName,
} from "./types";

/**
 * Defines the access flow (check-access + update-memberships + manage-rewards)
 */
export default class AccessFlow extends Flow<
  AccessQueueName,
  ManageRewardQueueName,
  AccessJob,
  AccessResult,
  CreateAccessFlowOptions
> {
  constructor(options: AccessFlowOptions) {
    const defaultAttributesToGet = ["userId", "roleIds"];
    const lookupAttributes = ["userId", "roleIds", "guildId"];

    const queueOptions: QueueOptions<AccessQueueName>[] = [
      {
        queueName: "preparation",
        attributesToGet: [...defaultAttributesToGet, "recheckAccess"],
      },
      {
        queueName: "access-check",
        attributesToGet: [...defaultAttributesToGet, "updateMemberships"],
      },
      {
        queueName: "update-membership",
        attributesToGet: [
          ...defaultAttributesToGet,
          "accessCheckResult",
          "manageRewards",
        ],
      },
      {
        queueName: "prepare-manage-reward",
        attributesToGet: [
          ...defaultAttributesToGet,
          "updateMembershipResult",
          "guildId",
          "forceRewardActions",
          "onlyForThisPlatform",
        ],
      },
      {
        queueName: "access-result",
        attributesToGet: [
          ...defaultAttributesToGet,
          "updateMembershipResult",
          "guildId",
          "forceRewardActions",
          "onlyForThisPlatform",
        ],
      },
    ];

    const childQueueNames: ManageRewardQueueName[] = [
      "manage-reward:discord",
      "manage-reward:telegram",
      "manage-reward:github",
      "manage-reward:google",
      "manage-reward:nft",
    ];

    super({
      ...options,
      prefix: "access-flow",
      queueOptions,
      lookupAttributes,
      childQueueNames,
    });
  }
}
