import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { AccessFlowJob } from "../access/types";
import { FlowProps } from "../types";

const getWeb3InboxMessagingProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (QueueOptions<AccessFlowJob["queueName"]> | Queue)[] = [
    {
      queueName: "send-web3inbox-message",
      attributesToGet: [
        "requestHeaders",
        "messageId",
        "guildId",
        "notification",
        "recipients",
        "readyTimestamp",
      ],
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

export default getWeb3InboxMessagingProps;
