import getAccessFlowProps from "./access/getAccessFlowData";
import getMessagingProps from "./messaging/getMessagingFlowData";
import getStatusUpdateFlowProps from "./statusUpdate/getStatusUpdateFlowData";
import getSnapshotFlowProps from "./snapshot/getSnapshotFlowData";
import { Flows } from "./types";

const accessFlowData = getAccessFlowProps();
const statusUpdateFlowData = getStatusUpdateFlowProps();
const messagingFlowData = getMessagingProps();
const snapshotFlowData = getSnapshotFlowProps();

const flows: Flows = {
  access: accessFlowData,
  "status-update": statusUpdateFlowData,
  messaging: messagingFlowData,
  "points-snapshot": snapshotFlowData,
};

export default flows;
