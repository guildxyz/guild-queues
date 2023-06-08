import ChildWorker from "../../base/hierarchical/ChildWorker";
import {
  ManageRewardJob,
  ManageRewardQueueName,
  ManageRewardResult,
} from "../types";

/**
 * A worker which adds/removes a reward in a given platform
 */
export default class ManageRewardWorker extends ChildWorker<
  ManageRewardQueueName,
  ManageRewardJob,
  ManageRewardResult
> {}
