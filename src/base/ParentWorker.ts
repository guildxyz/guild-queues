/* eslint-disable no-await-in-loop */
/* eslint-disable no-constant-condition */
import { uuidv7 } from "uuidv7";
import {
  delay,
  generateJobId,
  getKeyExpirySec,
  keyFormatter,
  objectToStringEntries,
  parseObject,
} from "../utils";
import Worker from "./Worker";
import {
  BaseChildParam,
  BaseJobParams,
  BaseJobResult,
  ParentWorkerOptions,
  WorkerFunction,
} from "./types";
import {
  DEFAULT_LOG_META,
  DEFAULT_PARENT_CHECK_INTERVAL_MS,
  DONE_FIELD,
  EXTRA_LOCK_SEC,
} from "../static";
import { ManageRewardChildParams } from "../flows/access/types";

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
    timeout
  ) => {
    const propertiesToLog = {
      ...DEFAULT_LOG_META,
      queueName: this.queue.name,
      priority: job.priority,
      flowName: job.flowName,
      workerId: this.id,
      jobId: job.id,
    };

    // get the params and ids (if they exist) of the child jobs from redis
    const jobKey = keyFormatter.job(job.id);
    const childParamsKey = keyFormatter.childrenParams(this.queue.name);
    const childJobsKey = keyFormatter.childrenJobs(this.queue.name);
    const [paramsString, jobsString] = await Promise.all([
      this.nonBlockingRedis.hGet(jobKey, childParamsKey),
      this.nonBlockingRedis.hGet(jobKey, childJobsKey),
    ]);
    const parentQueueName = this.queue.name;

    const params: BaseChildParam[] = JSON.parse(paramsString);
    let jobs: string[] = jobsString ? JSON.parse(jobsString) : [];

    // if the jobs haven't been created yet, create them
    // (this makes the parent worker idempotent)
    if (jobs.length === 0) {
      const transaction = this.nonBlockingRedis.multi();
      const newJobs: string[] = [];
      await Promise.all(
        params.map(async (param) => {
          if (!param.childName) {
            this.logger.warn(
              "Child name is missing in child params",
              propertiesToLog
            );
            return;
          }

          const priority = param.priority || job.priority;

          if (param.childName === "discord") {
            // TODO sql injection?
            const result = await this.queueClient.postgresClient.query(
              `INSERT INTO river_job (
                      state,
                      attempt,
                      max_attempts,
                      priority,
                      kind,
                      queue,
                      args
                  )
              VALUES (
                      'available',
                      0,
                      3,
                      ${priority},
                      'manage_roles_discord',
                      'default',
                      '{"job": ${JSON.stringify(
                (param as any as ManageRewardChildParams)
                  .manageRewardAction
              )}, "job_id": ${uuidv7()}, "correlation_id": ${this.correlator.getId()}}'
                  )
              returning id;`
              // [
              //   priority,
              //   JSON.stringify(
              //     (param as any as ManageRewardChildParams).manageRewardAction
              //   ),
              //   uuidv7(),
              //   this.correlator.getId(),
              // ]
            );
            this.logger.info("river job created", {
              riverJobId: result.rows[0].id,
              param,
              command: result.command, // TODO remove
            });
            return;
          }

          // the child flow name is composed of the parent queue name and the child name
          const childFlowName = `${parentQueueName}:${param.childName}`;

          // generate child job id
          const childJobId = generateJobId(childFlowName);

          const childJobKey = keyFormatter.job(childJobId);

          const childQueueKey = keyFormatter.childWaitingQueueName(
            parentQueueName,
            param.childName,
            priority
          );

          const childJob = param;
          childJob.priority = priority;
          childJob.flowName = childFlowName;
          childJob.correlationId = job.correlationId;
          delete childJob.childName;

          // create child job state
          transaction.hSet(childJobKey, objectToStringEntries(childJob));
          transaction.expire(
            childJobKey,
            getKeyExpirySec(childJob.flowName, childJob.priority)
          );
          // put it to the child queue
          transaction.rPush(childQueueKey, childJobId);

          // also store the child job keys for checking
          newJobs.push(childJobKey);
        })
      );

      // save the generated jobs to the parent
      transaction.hSet(jobKey, childJobsKey, JSON.stringify(newJobs));
      await transaction.exec();
      jobs = newJobs;
    }

    // periodical checking
    while (true) {
      // get the child job's done field
      const checkIfDoneTransaction = this.nonBlockingRedis.multi();
      jobs.forEach((j) => {
        checkIfDoneTransaction.hGet(j, DONE_FIELD);
      });
      checkIfDoneTransaction.exists(jobKey);
      const checkIfDoneResults = await checkIfDoneTransaction.exec();

      const existsResult = checkIfDoneResults.pop();
      if (existsResult === 0) {
        this.logger.info(
          "ParentWorker terminates, job key does not exists",
          propertiesToLog
        );
        break;
      }

      // check if all of them are done
      if (checkIfDoneResults.every((r) => r === "true")) {
        const getChildJobsTransaction = this.nonBlockingRedis.multi();
        jobs.forEach((j) => {
          getChildJobsTransaction.hGetAll(j);
        });
        const rawChildJobs = await getChildJobsTransaction.exec();
        const childJobs = rawChildJobs.map((c) =>
          parseObject(c as any, this.logger)
        );
        const resultsKey = keyFormatter.childrenResults(parentQueueName);
        this.nonBlockingRedis.hSet(
          jobKey,
          resultsKey,
          JSON.stringify(childJobs)
        );

        break;
      }

      // reset timeout
      const lockKey = keyFormatter.lock(this.queue.name, job.id);
      await this.nonBlockingRedis.expire(
        lockKey,
        this.lockTimeSec + EXTRA_LOCK_SEC
      );
      timeout.refresh();

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
    this.checkInterval =
      options.checkInterval || DEFAULT_PARENT_CHECK_INTERVAL_MS;
  }
}
