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
  icon?: string;
};

export type Web3InboxLookupAttributes = "guildId";

export type Web3InboxJobOptions = {
  priority: number;
  requestHeaders: object;
  guildId: number;
  notification: Notification;
  recipients: string[];
  readyTimestamp?: Date;
};

export type Web3InboxJobResult = BaseJobResult & { done: true };

export type Web3InboxMessagingJob = {
  queueName: "send-web3inbox-message";
  children: [];
  params: BaseJobParams & Web3InboxJobOptions;
  result: Web3InboxJobResult;
};

export type Web3InboxMessagingContent = Web3InboxJobOptions &
  BaseJobParams &
  ManagedJobFields &
  Web3InboxMessagingJob["result"];
