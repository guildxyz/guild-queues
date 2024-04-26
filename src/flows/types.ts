import Queue from "../base/Queue";
import {
  AccessFlowJob,
  AccessJobContent,
  AccessLookupAttributes,
  CreateAccessJobOptions,
} from "./access/types";
import {
  MessagingContent,
  MessagingJob,
  MessagingJobOptions,
  MessagingLookupAttributes,
} from "./messaging/types";
import {
  PointsSnapshotContent,
  PointsSnapshotJob,
  PointsSnapshotJobOptions,
  PointsSnapshotLookupAttributes,
} from "./snapshot/types";
import {
  CreateStatusUpdateJobOptions,
  StatusUpdateFlowJob,
  StatusUpdateJobContent,
  StatusUpdateLookupAttributes,
} from "./statusUpdate/types";

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
  messaging: {
    job: MessagingJob;
    content: MessagingContent;
    createJobOptions: MessagingJobOptions;
    lookupAttributes: MessagingLookupAttributes;
  };
  "points-snapshot": {
    job: PointsSnapshotJob;
    content: PointsSnapshotContent;
    createJobOptions: PointsSnapshotJobOptions;
    lookupAttributes: PointsSnapshotLookupAttributes;
  };
};

export type FlowNames = keyof FlowTypes;

export type FlowProps = {
  queues: Queue[];
  lookupAttributes: string[];
};

export type Flows = Record<FlowNames, FlowProps>;
