import Queue from "../base/Queue";
import {
  AccessFlowJob,
  AccessLookupAttributes,
  CreateAccessJobOptions,
} from "./access/types";
import {
  CreateStatusUpdateJobOptions,
  StatusUpdateJob,
  StatusUpdateLookupAttributes,
} from "./statusUpdate/types";

export type FlowTypes = {
  access: {
    job: AccessFlowJob;
    createJobOptions: CreateAccessJobOptions;
    lookupAttributes: AccessLookupAttributes;
  };
  "status-update": {
    job: StatusUpdateJob;
    createJobOptions: CreateStatusUpdateJobOptions;
    lookupAttributes: StatusUpdateLookupAttributes;
  };
};

export type FlowNames = keyof FlowTypes;

export type FlowProps = {
  queues: Queue[];
  lookupAttributes: string[];
};

export type Flows = Record<FlowNames, FlowProps>;
