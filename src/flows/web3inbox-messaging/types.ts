import {
  BaseJobParams,
  BaseJobResult,
  ManagedJobFields,
} from "../../base/types";

export type Web3InboxLookupAttributes = "guildId";

export type Web3InboxJobOptions = {
  priority: number;
  guildId: number;
  message: string;
};
// amit ehhez hozzáadsz, azt add hozzá a getWeb3InboxMessagingProps--hez is attributesToGet-be

export type Web3InboxMessagingJob = {
  queueName: "send-web3inbox-message";
  children: [];
  params: BaseJobParams & Web3InboxJobOptions;
  result: BaseJobResult & { done: true };
};

export type Web3InboxMessagingContent = Web3InboxJobOptions &
  BaseJobParams &
  ManagedJobFields &
  Web3InboxMessagingJob["result"];
