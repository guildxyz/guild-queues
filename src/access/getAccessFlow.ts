import Flow from "../base/Flow";
import { QueueOptions } from "../base/types";
import {
  AccessFlowOptions,
  AccessQueueJob,
  CreateAccessJobOptions,
} from "./types";

/**
 * Create a Flow instance for the access flow
 * @param options Access flow options
 * @returns Flow instance
 */
const createAccessFlow = (options: AccessFlowOptions) => {
  // most of the access flow jobs need the userId and roleId
  const defaultAttributesToGet = ["userId", "roleIds"];
  // all manage reward child jobs only need the manageRewardAction attribute
  const manageRewardAttributeToGet = ["manageRewardAction"];
  // we want to fetch the access flow jobs by userId, roleId, guildId, in the queues
  const lookupAttributes = ["userId", "roleIds", "guildId"];
  // we also need the define the type for the flow
  type LookupAttributes = "guildId" | "roleIds" | "userId";

  // queues of the AccessFlow
  const queueOptions: QueueOptions[] = [
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
      nextQueueName: "manage-reward",
    },
    {
      queueName: "manage-reward",
      attributesToGet: [
        ...defaultAttributesToGet,
        "children:manage-reward:params",
        "children:manage-reward:jobs",
      ],
      nextQueueName: "access-result",
      children: [
        {
          queueName: "discord",
          attributesToGet: manageRewardAttributeToGet,
        },
        {
          queueName: "telegram",
          attributesToGet: manageRewardAttributeToGet,
        },
        {
          queueName: "github",
          attributesToGet: manageRewardAttributeToGet,
        },
        {
          queueName: "google",
          attributesToGet: manageRewardAttributeToGet,
        },
        {
          queueName: "nft",
          attributesToGet: manageRewardAttributeToGet,
        },
      ],
    },
    {
      queueName: "access-result",
      attributesToGet: defaultAttributesToGet,
    },
  ];

  // create the flow and return it
  return new Flow<AccessQueueJob, CreateAccessJobOptions, LookupAttributes>({
    ...options,
    name: "access",
    queueOptions,
    lookupAttributes,
  });
};

export default createAccessFlow;
