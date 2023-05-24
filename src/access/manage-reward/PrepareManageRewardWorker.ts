import ParentWorker from "../../base/hierarchcal/ParentWorker";
import {
  ManageRewardParams,
  PrepareManageRewardJob,
  PrepareManageRewardResult,
} from "./types";

export default class PrepareManageRewardWorker extends ParentWorker<
  string,
  PrepareManageRewardJob,
  ManageRewardParams,
  PrepareManageRewardResult
> {}
