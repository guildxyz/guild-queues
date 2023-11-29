import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { accessCheckQueue, manageRewardQueue } from "../sharedQueues";
import { FlowProps } from "../types";
import { StatusUpdateFlowJob } from "./types";

const getStatusUpdateFlowProps = (): FlowProps => {
  const defaultAttributesToGet = ["userIds", "guildId", "roleIds"];
  const lookupAttributes = ["roleIds", "guildId"];

  const queueOptions: (
    | QueueOptions<StatusUpdateFlowJob["queueName"]>
    | Queue
  )[] = [
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
      nextQueueName: "access-check" as StatusUpdateFlowJob["queueName"],
      maxRetries: 10, // this is for the parent queue only, not the child queues
    },
    accessCheckQueue,
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
      nextQueueName: "manage-reward",
    },
    manageRewardQueue,
    {
      queueName: "status-update-result",
      attributesToGet: defaultAttributesToGet,
    },
  ];

  const queues = queueOptions.map((queueOption) => {
    if (queueOption instanceof Queue) {
      return queueOption;
    }
    return new Queue(queueOption);
  });

  return {
    queues,
    lookupAttributes,
  };
};

export default getStatusUpdateFlowProps;
