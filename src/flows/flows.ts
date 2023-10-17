import getAccessFlowProps from "./access/getAccessFlowData";
import getStatusUpdateFlowProps from "./statusUpdate/getStatusUpdateFlowData";
import { Flows } from "./types";

const accessFlowData = getAccessFlowProps();
const statusUpdateFlowData = getStatusUpdateFlowProps();

const flows: Flows = {
  access: accessFlowData,
  "status-update": statusUpdateFlowData,
};

export default flows;
