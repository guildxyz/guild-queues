import {
  BaseJobParams,
  BaseJobResult,
  ManagedJobFields,
} from "../../base/types";

type Notification = {
  type: string;
  title: string;
  body: string;
  url?: string;
};

export type MessagingLookupAttributes = "guildId";

export type MessagingJobOptions = {
  protocol: "XMTP" | "WEB3INBOX";
  priority: number;
  messageId: number;
  guildId: number;
  notification: Notification | string;
  recipients: string[];
  readyTimestamp?: Date;
};

export type MessagingJobResult = BaseJobResult & { done: true };

export type MessagingJob = {
  queueName: "send-message";
  children: [];
  params: BaseJobParams & MessagingJobOptions;
  result: MessagingJobResult;
};

export type MessagingContent = MessagingJobOptions &
  BaseJobParams &
  ManagedJobFields &
  MessagingJob["result"];
