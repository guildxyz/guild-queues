import getAccessFlowProps from "./access/getAccessFlowData";
import getMessagingProps from "./messaging/getMessagingFlowData";
import getStatusUpdateFlowProps from "./statusUpdate/getStatusUpdateFlowData";
import { Flows } from "./types";

const accessFlowData = getAccessFlowProps();
const statusUpdateFlowData = getStatusUpdateFlowProps();
const messagingFlowData = getMessagingProps();

const flows: Flows = {
  access: accessFlowData,
  "status-update": statusUpdateFlowData,
  messaging: messagingFlowData,
};

export default flows;
