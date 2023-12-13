import {
  BaseJobParams,
  BaseJobResult,
  ManagedJobFields,
} from "../../base/types";

export type XmtpLookupAttributes = "guildId";

export type XmtpJobOptions = {
  priority: number;
  messageId: number;
  guildId: number;
  message: string;
  recipients: string[];
  readyTimestamp?: Date;
};

export type XmtpJobResult = BaseJobResult & { done: true };

export type XmtpMessagingJob = {
  queueName: "send-xmtp-message";
  children: [];
  params: BaseJobParams & XmtpJobOptions;
  result: XmtpJobResult;
};

export type XmtpMessagingContent = XmtpJobOptions &
  BaseJobParams &
  ManagedJobFields &
  XmtpMessagingJob["result"];
