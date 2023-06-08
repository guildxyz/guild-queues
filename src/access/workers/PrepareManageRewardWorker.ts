import ParentWorker from "../../base/hierarchcal/ParentWorker";
import {
  AccessQueueName,
  ManageRewardParams,
  PrepareManageRewardJob,
  PrepareManageRewardResult,
} from "../types";

export default class PrepareManageRewardWorker extends ParentWorker<
  AccessQueueName,
  PrepareManageRewardJob,
  ManageRewardParams,
  PrepareManageRewardResult
> {}
