import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { FlowProps } from "../types";
import { MessagingJob } from "./types";

const getMessagingProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (QueueOptions<MessagingJob["queueName"]> | Queue)[] = [
    {
      queueName: "send-message",
      attributesToGet: [
        "protocol",
        "messageId",
        "guildId",
        "senderUserId",
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

export default getMessagingProps;
