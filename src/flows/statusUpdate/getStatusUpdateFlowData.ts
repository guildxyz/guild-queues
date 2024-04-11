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
      maxRetries: 1,
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
      nextQueuePriorityDiffMap: new Map([["status-update", +1]]), // increase priority by one (make it less important)
      maxRetries: 10, // this is for the parent queue only, not the child queues
    },
    accessCheckQueue,
    {
      queueName: "bulk-access-logic",
      attributesToGet: [
        ...defaultAttributesToGet,
        "children:access-check:jobs",
        "children:bulk-access-check:jobs",
        "updateMemberships",
        "existingAccesses",
      ],
      maxRetries: 1,
    },
    {
      queueName: "bulk-update-membership",
      attributesToGet: [
        ...defaultAttributesToGet,
        "userRoleAccesses",
        "manageRewards",
      ],
      maxRetries: 1,
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
      nextQueuePriorityDiffMap: new Map([["status-update", +1]]), // increase priority by one (make it less important)
      maxRetries: 1,
    },
    manageRewardQueue,
    {
      queueName: "status-update-result",
      attributesToGet: defaultAttributesToGet,
      maxRetries: 1,
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
