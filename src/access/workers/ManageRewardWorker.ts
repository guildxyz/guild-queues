import ChildWorker from "../../base/hierarchcal/ChildWorker";
import {
  ManageRewardJob,
  ManageRewardQueueName,
  ManageRewardResult,
} from "../types";

export default class ManageRewardWorker extends ChildWorker<
  ManageRewardQueueName,
  ManageRewardJob,
  ManageRewardResult
> {}
