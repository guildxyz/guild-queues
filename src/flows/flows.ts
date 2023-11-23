import getAccessFlowProps from "./access/getAccessFlowData";
import getStatusUpdateFlowProps from "./statusUpdate/getStatusUpdateFlowData";
import { Flows } from "./types";
import getWeb3InboxMessagingProps from "./web3inbox-messaging/getWeb3InboxFlowData";

const accessFlowData = getAccessFlowProps();
const statusUpdateFlowData = getStatusUpdateFlowProps();
const web3InboxMessagingFlowData = getWeb3InboxMessagingProps();

const flows: Flows = {
  access: accessFlowData,
  "status-update": statusUpdateFlowData,
  "web3inbox-messaging": web3InboxMessagingFlowData,
};

export default flows;
