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
    // most of the access flow jobs need the userId and roleId
    const defaultAttributesToGet = ["userId", "roleIds"];
    // we want to fetch the access flow states by userId, roleId, guildId
    const lookupAttributes = ["userId", "roleIds", "guildId"];

    // queues of the AccessFlow
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
        nextQueueName: "access-result",
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
