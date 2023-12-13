import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { FlowProps } from "../types";
import { Web3InboxMessagingJob } from "./types";

const getWeb3InboxMessagingProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (
    | QueueOptions<Web3InboxMessagingJob["queueName"]>
    | Queue
  )[] = [
    {
      queueName: "send-web3inbox-message",
      attributesToGet: [
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
