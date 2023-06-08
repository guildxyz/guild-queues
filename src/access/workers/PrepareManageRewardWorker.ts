import ParentWorker from "../../base/hierarchcal/ParentWorker";
import {
  AccessQueueName,
  ManageRewardParams,
  ManageRewardQueueName,
  PrepareManageRewardJob,
  PrepareManageRewardResult,
} from "../types";

export default class PrepareManageRewardWorker extends ParentWorker<
  AccessQueueName,
  ManageRewardQueueName,
  PrepareManageRewardJob,
  ManageRewardParams,
  PrepareManageRewardResult
> {}
