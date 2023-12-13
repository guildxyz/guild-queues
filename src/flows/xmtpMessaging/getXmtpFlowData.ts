import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { FlowProps } from "../types";
import { XmtpMessagingJob } from "./types";

const getXmtpMessagingProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (QueueOptions<XmtpMessagingJob["queueName"]> | Queue)[] =
    [
      {
        queueName: "send-xmtp-message",
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

export default getXmtpMessagingProps;
