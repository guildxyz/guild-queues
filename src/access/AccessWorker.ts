import PrimaryWorker from "../base/primary/PrimaryWorker";
import { AccessJob, AccessQueueName, AccessResult } from "./types";

export default class AccessWorker<
  Job extends AccessJob,
  Result extends AccessResult
> extends PrimaryWorker<AccessQueueName, Job, Result> {}
