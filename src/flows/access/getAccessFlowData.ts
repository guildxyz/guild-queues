import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { AccessFlowJob } from "./types";
import { accessCheckQueue, manageRewardQueue } from "../sharedQueues";
import { FlowProps } from "../types";

const getAccessFlowProps = (): FlowProps => {
  // most of the access flow jobs need the userId and roleId
  const defaultAttributesToGet = ["userId", "guildId", "roleIds"];
  // we want to fetch the access flow jobs by userId, roleId, guildId in the queues
  const lookupAttributes = ["userId", "roleIds", "guildId"];

  // queues of the AccessFlow
  const queueOptions: (QueueOptions<AccessFlowJob["queueName"]> | Queue)[] = [
    {
      queueName: "access-preparation",
      attributesToGet: [...defaultAttributesToGet, "recheckAccess", "guildId"],
    },
    accessCheckQueue,
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
        "shareSocials",
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
    manageRewardQueue,
    {
      queueName: "access-result",
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

export default getAccessFlowProps;
