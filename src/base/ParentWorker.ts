/* eslint-disable no-await-in-loop */
/* eslint-disable no-constant-condition */
import { uuidv7 } from "uuidv7";
import { delay, keyFormatter, objectToStringEntries } from "../utils";
import Worker from "./Worker";
import {
  BaseChildParam,
  BaseJobParams,
  BaseJobResult,
  ParentWorkerOptions,
  WorkerFunction,
} from "./types";
import {
  DEFAULT_KEY_EXPIRY_SEC,
  DEFAULT_LOG_META,
  DEFAULT_PARENT_CHECK_INTERVAL_MS,
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
    job,
    queueIndex
  ) => {
    // get the params and ids (if they exist) of the child jobs from redis
    const jobKey = keyFormatter.job(this.flowName, job.id);
    const childParamsKey = keyFormatter.childrenParams(
      this.queues[queueIndex].name
    );
    const childJobsKey = keyFormatter.childrenJobs(
      this.queues[queueIndex].name
    );
    const [paramsString, jobsString] = await Promise.all([
      this.nonBlockingRedis.hGet(jobKey, childParamsKey),
      this.nonBlockingRedis.hGet(jobKey, childJobsKey),
    ]);
    const childGroup = this.queues[queueIndex].name;

    const params: BaseChildParam[] = JSON.parse(paramsString);
    let jobs: string[] = jobsString ? JSON.parse(jobsString) : [];

    // if the jobs haven't been created yet, create them
    // (this makes the parent worker idempotent)
    if (jobs.length === 0) {
      const transaction = this.nonBlockingRedis.multi();
      const newJobs: string[] = [];
      params.forEach((param) => {
        if (!param.childName) {
          this.logger.warn("Child name is missing in child params", {
            ...DEFAULT_LOG_META,
            queueName: this.queues[queueIndex].name,
            flowName: this.flowName,
            workerId: this.id,
            jobId: job.id,
          });
          return;
        }

        // generate child job id
        const childJobId = uuidv7();

        const childJobKey = keyFormatter.childJob(
          childGroup,
          param.childName,
          childJobId
        );
        const childQueueKey = keyFormatter.childWaitingQueueName(
          childGroup,
          param.childName
        );

        const childJob = param;
        delete childJob.childName;

        // create child job state
        transaction.hSet(childJobKey, objectToStringEntries(childJob));
        transaction.expire(childJobKey, DEFAULT_KEY_EXPIRY_SEC);
        // put it to the child queue
        transaction.rPush(childQueueKey, childJobId);

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
      nextQueue: this.queues[queueIndex].nextQueueName,
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
    this.checkInterval =
      options.checkInterval || DEFAULT_PARENT_CHECK_INTERVAL_MS;
  }
}
