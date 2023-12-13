import getAccessFlowProps from "./access/getAccessFlowData";
import getStatusUpdateFlowProps from "./statusUpdate/getStatusUpdateFlowData";
import { Flows } from "./types";
import getWeb3InboxMessagingProps from "./web3InboxMessaging/getWeb3InboxFlowData";
import getXmtpMessagingProps from "./xmtpMessaging/getXmtpFlowData";

const accessFlowData = getAccessFlowProps();
const statusUpdateFlowData = getStatusUpdateFlowProps();
const web3InboxMessagingFlowData = getWeb3InboxMessagingProps();
const xmtpMessagingFlowData = getXmtpMessagingProps();

const flows: Flows = {
  access: accessFlowData,
  "status-update": statusUpdateFlowData,
  "web3inbox-messaging": web3InboxMessagingFlowData,
  "xmtp-messaging": xmtpMessagingFlowData,
};

export default flows;
