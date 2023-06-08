import ParentWorker from "../../base/hierarchical/ParentWorker";
import {
  AccessQueueName,
  ManageRewardParams,
  ManageRewardQueueName,
  PrepareManageRewardJob,
  PrepareManageRewardResult,
} from "../types";

/**
 * A worker which determines which manage-reward jobs to create and creates them
 */
export default class PrepareManageRewardWorker extends ParentWorker<
  AccessQueueName,
  ManageRewardQueueName,
  PrepareManageRewardJob,
  ManageRewardParams,
  PrepareManageRewardResult
> {}
