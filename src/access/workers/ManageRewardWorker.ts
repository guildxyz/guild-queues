import ChildWorker from "../../base/hierarchcal/ChildWorker";
import { ManageRewardJob } from "../types";

export default class ManageRewardWorker extends ChildWorker<
  ManageRewardJob,
  any
> {}
