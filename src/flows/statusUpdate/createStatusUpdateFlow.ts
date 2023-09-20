import Flow from "../../base/Flow";
import { QueueOptions } from "../../base/types";
import {
  CreateStatusUpdateJobOptions,
  StatusUpdateFlowOptions,
  StatusUpdateJob,
} from "./types";

const createStatusUpdateFlow = (options: StatusUpdateFlowOptions) => {
  const defaultAttributesToGet = [
    "userIds",
    "guildId",
    "roleIds",
    "correlationId",
  ];
  const manageRewardAttributeToGet = ["manageRewardAction"];
  const lookupAttributes = ["userIds", "roleIds", "guildId"];
  type LookupAttributes = "userIds" | "roleIds" | "guildId";

  const queueOptions: QueueOptions<StatusUpdateJob["queueName"]>[] = [
    {
      queueName: "status-update-preparation",
      attributesToGet: [...defaultAttributesToGet, "recheckAccess", "guildId"],
    },
    {
      queueName: "bulk-access-check",
      attributesToGet: [...defaultAttributesToGet],
      children: [
        {
          queueName: "requirement",
          attributesToGet: ["userIds", "requirementId"],
        },
      ],
      nextQueueName: "bulk-access-logic",
    },
    {
      queueName: "bulk-access-logic",
      attributesToGet: [
        ...defaultAttributesToGet,
        "children:bulk-access-check:jobs",
        "updateMemberships",
      ],
    },
    {
      queueName: "bulk-update-membership",
      attributesToGet: [
        ...defaultAttributesToGet,
        "userRoleAccesses",
        "manageRewards",
      ],
    },
    {
      queueName: "bulk-prepare-manage-reward",
      attributesToGet: [
        ...defaultAttributesToGet,
        "bulkUpdateMembershipResult",
        "guildId",
        "forceRewardActions",
        "onlyForThisPlatform",
      ],
      nextQueueName: "status-update-manage-reward",
    },
    {
      queueName: "status-update-manage-reward",
      attributesToGet: [
        ...defaultAttributesToGet,
        "children:status-update-manage-reward:params",
        "children:status-update-manage-reward:jobs",
      ],
      nextQueueName: "status-update-result",
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
      queueName: "status-update-result",
      attributesToGet: defaultAttributesToGet,
    },
  ];

  return new Flow<
    StatusUpdateJob,
    CreateStatusUpdateJobOptions,
    LookupAttributes
  >({
    ...options,
    name: "status-update",
    queueOptions,
    lookupAttributes,
  });
};

export default createStatusUpdateFlow;
