import Queue from "../base/Queue";
import {
  AccessFlowJob,
  AccessJobContent,
  AccessLookupAttributes,
  CreateAccessJobOptions,
} from "./access/types";
import {
  CreateStatusUpdateJobOptions,
  StatusUpdateFlowJob,
  StatusUpdateJobContent,
  StatusUpdateLookupAttributes,
} from "./statusUpdate/types";
import {
  Web3InboxJobOptions,
  Web3InboxLookupAttributes,
  Web3InboxMessagingContent,
  Web3InboxMessagingJob,
} from "./web3InboxMessaging/types";
import {
  XmtpJobOptions,
  XmtpLookupAttributes,
  XmtpMessagingContent,
  XmtpMessagingJob,
} from "./xmtpMessaging/types";

export type FlowTypes = {
  access: {
    job: AccessFlowJob;
    content: AccessJobContent;
    createJobOptions: CreateAccessJobOptions;
    lookupAttributes: AccessLookupAttributes;
  };
  "status-update": {
    job: StatusUpdateFlowJob;
    content: StatusUpdateJobContent;
    createJobOptions: CreateStatusUpdateJobOptions;
    lookupAttributes: StatusUpdateLookupAttributes;
  };
  "web3inbox-messaging": {
    job: Web3InboxMessagingJob;
    content: Web3InboxMessagingContent;
    createJobOptions: Web3InboxJobOptions;
    lookupAttributes: Web3InboxLookupAttributes;
  };
  "xmtp-messaging": {
    job: XmtpMessagingJob;
    content: XmtpMessagingContent;
    createJobOptions: XmtpJobOptions;
    lookupAttributes: XmtpLookupAttributes;
  };
};

export type FlowNames = keyof FlowTypes;

export type FlowProps = {
  queues: Queue[];
  lookupAttributes: string[];
};

export type Flows = Record<FlowNames, FlowProps>;
