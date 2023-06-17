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

/**
 * Special worker which only creates child jobs and checks their status periodically
 */
export default class ParentWorker extends Worker<BaseJobParams, BaseJobResult> {
  /**
   * Check if the child jobs are running this often
   */
  private checkInterval: number;

  /**
   * Creates child jobs (if they don't exist) and checks their status periodically
   * @param job The job to execute
   * @returns result which contains the next queue
   */
  parentWorkerFunction: WorkerFunction<BaseJobParams, BaseJobResult> = async (
    job
  ) => {
    // get the params and ids (if they exist) of the child jobs from redis
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

    // if the jobs haven't been created yet, create them
    // (this makes the parent worker idempotent)
    if (jobs.length === 0) {
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

        // generate child job id
        const childId = uuidV4();

        const childJobKey = `${JOB_KEY_PREFIX}:${childGroup}:${p.childName}:${childId}`;
        const childQueueKey = `${QUEUE_KEY_PREFIX}:${childGroup}:${p.childName}:waiting`;

        const childJob = p;
        delete childJob.childName;

        // create child job state
        transaction.hSet(childJobKey, objectToStringEntries(childJob));
        // put it to the child queue
        transaction.rPush(childQueueKey, childId);

        // also store the child job keys for checking
        newJobs.push(childJobKey);
      });

      // save the generated jobs to the parent
      transaction.hSet(jobKey, childJobsKey, JSON.stringify(newJobs));
      await transaction.exec();
      jobs = newJobs;
    }

    // periodical checking
    while (true) {
      // get the child job's done field
      const transaction = this.nonBlockingRedis.multi();
      jobs.forEach((j) => {
        transaction.hGet(j, "done");
      });
      const results = await transaction.exec();

      // check if all of them are done
      if (results.every((r) => r === "true")) {
        break;
      }

      // wait checkInterval milliseconds
      await delay(this.checkInterval);
    }

    // return with the next queue, so it the job will be passed there
    return {
      nextQueue: this.queue.nextQueueName,
    };
  };

  /**
   * OOP boilerplate
   * @param options Options to create a parent worker
   */
  constructor(options: ParentWorkerOptions) {
    super({
      workerFunction: null,
      ...options,
    });
    this.workerFunction = this.parentWorkerFunction; // can't pass this to the constructor: 'this' is not allowed before 'super()'
    this.checkInterval = options.checkInterval || DEFAULT_PARENT_CHECK_INTERVAL;
  }
}
