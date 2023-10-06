import Flow from "../../base/Flow";
import { QueueOptions } from "../../base/types";
import {
  AccessFlowOptions,
  AccessFlowJob,
  CreateAccessJobOptions,
} from "./types";

/**
 * Create a Flow instance for the access flow
 * @param options Access flow options
 * @returns Flow instance
 */
const createAccessFlow = (options: AccessFlowOptions) => {
  // most of the access flow jobs need the userId and roleId
  const defaultAttributesToGet = [
    "userId",
    "guildId",
    "roleIds",
    "correlationId",
  ];
  // all manage reward child jobs only need the manageRewardAction attribute
  const manageRewardAttributeToGet = ["manageRewardAction"];
  // we want to fetch the access flow jobs by userId, roleId, guildId, in the queues
  const lookupAttributes = ["userId", "roleIds", "guildId"];
  // we also need to define the type for the flow
  type LookupAttributes = "userId" | "roleIds" | "guildId";

  // queues of the AccessFlow
  const queueOptions: QueueOptions[] = [
    {
      queueName: "access-preparation",
      attributesToGet: [...defaultAttributesToGet, "recheckAccess", "guildId"],
    },
    {
      queueName: "access-check",
      attributesToGet: [...defaultAttributesToGet, "requirementIds"],
      children: [
        {
          queueName: "requirement",
          attributesToGet: ["userId", "requirementId"],
        },
      ],
      nextQueueName: "access-logic",
    },
    {
      queueName: "access-logic",
      attributesToGet: [
        ...defaultAttributesToGet,
        "children:access-check:jobs",
        "updateMemberships",
      ],
    },
    {
      queueName: "update-membership",
      attributesToGet: [
        ...defaultAttributesToGet,
        "roleAccesses",
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
          limiter: {
            groupJobKey: "platformGuildId",
            intervalMs: 5 * 1000,
            reservoir: 5,
          },
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
  return new Flow<AccessFlowJob, CreateAccessJobOptions, LookupAttributes>({
    ...options,
    name: "access",
    queueOptions,
    lookupAttributes,
  });
};

export default createAccessFlow;
