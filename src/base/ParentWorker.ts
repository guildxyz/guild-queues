/* eslint-disable no-await-in-loop */
/* eslint-disable no-constant-condition */
import { v4 as uuidV4 } from "uuid";
import { delay, objectToStringEntries } from "../utils";
import Worker from "./Worker";
import {
  BaseChildParam,
  BaseJobParams,
  BaseJobResult,
  ParentWorkerOptions,
  WorkerFunction,
} from "./types";
import {
  DEFAULT_PARENT_CHECK_INTERVAL,
  JOB_KEY_PREFIX,
  QUEUE_KEY_PREFIX,
} from "../static";

export default class ParentWorker extends Worker<BaseJobParams, BaseJobResult> {
  private checkInterval: number;

  parentWorkerFunction: WorkerFunction<BaseJobParams, BaseJobResult> = async (
    job
  ) => {
    const jobKey = `${JOB_KEY_PREFIX}:${this.flowName}:${job.id}`;
    const childParamsKey = `children:${this.queue.name}:params`;
    const childJobsKey = `children:${this.queue.name}:jobs`;
    const [paramsString, jobsString] = await Promise.all([
      this.nonBlockingRedis.hGet(jobKey, childParamsKey),
      this.nonBlockingRedis.hGet(jobKey, childJobsKey),
    ]);
    const childGroup = this.queue.name;

    const params: BaseChildParam[] = JSON.parse(paramsString);
    let jobs: string[] = jobsString ? JSON.parse(jobsString) : [];

    if (params.length > jobs.length) {
      const transaction = this.nonBlockingRedis.multi();
      const newJobs: string[] = [];
      params.forEach((p) => {
        if (!p.childName) {
          this.logger.warn("Child name is missing in child params", {
            queueName: this.queue.name,
            flowName: this.flowName,
            workerId: this.id,
            jobId: job.id,
          });
          return;
        }

        const childId = uuidV4();

        const childJobKey = `${JOB_KEY_PREFIX}:${childGroup}:${p.childName}:${childId}`;
        const childQueueKey = `${QUEUE_KEY_PREFIX}:${childGroup}:${p.childName}:waiting`;

        const childJob = p;
        delete childJob.childName;

        transaction.hSet(childJobKey, objectToStringEntries(childJob));
        transaction.rPush(childQueueKey, childId);

        newJobs.push(childJobKey);
      });
      transaction.hSet(jobKey, childJobsKey, JSON.stringify(newJobs));
      await transaction.exec();
      jobs = newJobs;
    }

    while (true) {
      await delay(this.checkInterval);
      const transaction = this.nonBlockingRedis.multi();
      jobs.forEach((j) => {
        transaction.hGet(j, "done");
      });
      const results = await transaction.exec();
      if (results.every((r) => r === "true")) {
        break;
      }
    }

    return {
      nextQueue: this.queue.nextQueueName,
    };
  };

  constructor(options: ParentWorkerOptions) {
    super({
      workerFunction: null,
      ...options,
    });
    this.workerFunction = this.parentWorkerFunction; // can't pass this to the constructor: 'this' is not allowed before 'super()'
    this.checkInterval = options.checkInterval || DEFAULT_PARENT_CHECK_INTERVAL;
  }
}
