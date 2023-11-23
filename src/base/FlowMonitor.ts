import { createClient } from "redis";
import { DogStatsD, FlowMonitorOptions, ILogger, RedisClient } from "./types";
import { delay, keyFormatter } from "../utils";
import {
  DEFAULT_LOG_META,
  DONE_FIELD,
  FAILED_ERROR_MSG_FIELD,
  FAILED_FIELD,
  FAILED_QUEUE_FIELD,
} from "../static";
import flows from "../flows/flows";
import Queue from "./Queue";

// flow monitor related types, that's why they're not in a separate file
export type DelayedJob = { jobId: string; readyTimestamp?: number };

export type JobsInQueue = {
  queueName: string;
  priorities: {
    [priority: number]: {
      waiting: string[];
      processing: string[];
      delayed: DelayedJob[];
    };
  };
};

export type Position = {
  position: number;
  queueName: string;
  state: "waiting" | "processing" | "delayed";
  readyTimestamp?: number;
};

export default class FlowMonitor {
  /**
   * Redis instance
   */
  private redis: RedisClient;

  /**
   * Provided logger
   */
  private readonly logger: ILogger;

  /**
   * Provided dogStatsD
   */
  private readonly dogStatsD: DogStatsD;

  /**
   * Update interval in milliseconds
   */
  private intervalMs: number;

  /**
   * Timer object which checks periodically
   */
  private timer: ReturnType<typeof setInterval>;

  /**
   * List of all the queues (including children)
   */
  private queues: Queue[] = [];

  /**
   * Map which stores the queues and their content
   * queueName -> priority -> waiting/processing/delayed
   */
  public jobsInQueues: JobsInQueue[];

  public jobIdToPositionMap: Map<string, Position> = new Map();

  /**
   * A set which contains jobIds which had one failed job lock check
   */
  public lockMissingJobsIdsSet: Set<string> = new Set();

  constructor(options: FlowMonitorOptions) {
    const { redisClientOptions, logger, dogStatsD, intervalMs } = options;

    this.logger = logger;
    this.dogStatsD = dogStatsD;
    this.intervalMs = intervalMs || 1000;

    this.redis = createClient(redisClientOptions);

    // put all queues in an array
    Object.values(flows).forEach((flowProps) => {
      const allQueues = [
        ...flowProps.queues,
        ...flowProps.queues.flatMap((queue) => queue.children),
      ];
      allQueues.forEach((queue) => {
        if (!this.queues.some(({ name }) => name === queue.name)) {
          this.queues.push(queue);
        }
      });
    });

    this.jobsInQueues = this.queues.map<JobsInQueue>((queue) => ({
      queueName: queue.name,
      priorities: Object.fromEntries(
        [...Array(queue.priorities).keys()].map<
          [number, JobsInQueue["priorities"][number]]
        >((i) => [
          i + 1,
          {
            waiting: [],
            processing: [],
            delayed: [],
          },
        ])
      ),
    }));
  }

  /**
   * Check if there's a lock for a given job of a queue
   * @param queueName name of the queue
   * @param jobId id of the job
   * @returns whether there's a lock associated with it
   */
  private checkJobLock = async (
    queueName: string,
    priority: number,
    jobId: string
  ) => {
    const lock = await this.redis.get(keyFormatter.lock(queueName, jobId));
    if (lock) {
      this.lockMissingJobsIdsSet.delete(jobId);
      return true;
    }

    if (!this.lockMissingJobsIdsSet.has(jobId)) {
      this.logger.info("Job lock not found for the first time", {
        ...DEFAULT_LOG_META,
        queueName,
        jobId,
      });
      this.lockMissingJobsIdsSet.add(jobId);
      return true;
    }

    this.logger.info("Job lock time exceeded", {
      ...DEFAULT_LOG_META,
      queueName,
      jobId,
    });

    const jobKey = keyFormatter.job(jobId);
    await Promise.all([
      this.redis.lRem(
        keyFormatter.processingQueueName(queueName, priority),
        1,
        jobId
      ),
      this.redis.hSet(jobKey, DONE_FIELD, "true"),
      this.redis.hSet(jobKey, FAILED_FIELD, "true"),
      this.redis.hSet(jobKey, FAILED_QUEUE_FIELD, `"${queueName}"`),
      this.redis.hSet(
        jobKey,
        FAILED_ERROR_MSG_FIELD,
        `"${queueName} lock time exceeded"`
      ),
    ]);

    this.lockMissingJobsIdsSet.delete(jobId);
    return false;
  };

  /**
   * Move delayed jobs to the start of the waiting queue if they are ready
   * @param queueName name of the queue
   * @param delayedJobs id and readyTimestamp of the delayed job
   * @returns the jobs which are still delayed (not resumed)
   */
  private resumeDelayedJobs = async (
    queueName: string,
    priority: number,
    delayedJobs: DelayedJob[]
  ) => {
    const now = Date.now();
    const jobIdsToResume: string[] = delayedJobs
      .filter((job) => job.readyTimestamp <= now)
      // sort to descending order, so the oldest will be added last with LPUSH
      // thus itt will be the first in the waiting queue
      .sort((a, b) => b.readyTimestamp - a.readyTimestamp)
      .map((job) => job.jobId);

    if (jobIdsToResume.length === 0) {
      return delayedJobs;
    }

    const delayedQueueName = keyFormatter.delayedQueueName(queueName, priority);
    const waitingQueueName = keyFormatter.waitingQueueName(queueName, priority);

    await this.redis
      .multi()
      .lPush(waitingQueueName, jobIdsToResume)
      .zRem(delayedQueueName, jobIdsToResume)
      .exec();

    jobIdsToResume.forEach((jobId) => {
      this.logger.info("Job resumed", {
        ...DEFAULT_LOG_META,
        queueName,
        jobId,
      });
    });

    return delayedJobs.filter((job) => !jobIdsToResume.includes(job.jobId));
  };

  /**
   * Update the queue-jobs map, check all jobs' locks
   */
  private refreshQueueList = async () => {
    await Promise.all([
      // queues
      this.queues.map(async (queue) => {
        const queueNameForGauge = queue.name.replaceAll(":", ".");
        // priorities
        [...Array(queue.priorities).keys()].map(async (i) => {
          const priority = i + 1; // priorities start from 1

          // waiting
          const waitingQueueName = keyFormatter.waitingQueueName(
            queue.name,
            priority
          );
          const waitingJobIds = await this.redis.lRange(
            waitingQueueName,
            0,
            -1
          );

          // processing
          const processingQueueName = keyFormatter.processingQueueName(
            queue.name,
            priority
          );
          const processingJobIds = await this.redis.lRange(
            processingQueueName,
            0,
            -1
          );

          const validProcessingJobIds = (
            await Promise.all(
              processingJobIds.map(async (jobId) => ({
                jobId,
                valid: await this.checkJobLock(queue.name, priority, jobId),
              }))
            )
          )
            .filter(({ valid }) => !!valid)
            .map(({ jobId }) => jobId);

          // delayed
          let filteredDelayedJobs: DelayedJob[] = [];
          if (queue.delayable) {
            const delayedQueueName = keyFormatter.delayedQueueName(
              queue.name,
              priority
            );
            const jobIdsWithReadyTimestamps = await this.redis.zRangeWithScores(
              delayedQueueName,
              0,
              -1
            );

            const delayedJobs = jobIdsWithReadyTimestamps.map<DelayedJob>(
              ({ score, value }) => ({
                jobId: value,
                readyTimestamp: score,
              })
            );

            filteredDelayedJobs = await this.resumeDelayedJobs(
              queue.name,
              priority,
              delayedJobs
            );
          }

          // update state
          this.jobsInQueues.find(
            ({ queueName }) => queueName === queue.name
          ).priorities[priority] = {
            waiting: waitingJobIds,
            processing: validProcessingJobIds,
            delayed: filteredDelayedJobs,
          };
          waitingJobIds.forEach((jobId, index) => {
            this.jobIdToPositionMap.set(jobId, {
              queueName: queue.name,
              position: index + 1,
              state: "waiting",
            });
          });
          validProcessingJobIds.forEach((jobId, index) => {
            this.jobIdToPositionMap.set(jobId, {
              queueName: queue.name,
              position: index + 1,
              state: "processing",
            });
          });
          if (queue.delayable) {
            filteredDelayedJobs.forEach((job, index) => {
              this.jobIdToPositionMap.set(job.jobId, {
                queueName: queue.name,
                position: index + 1,
                state: "delayed",
                readyTimestamp: job.readyTimestamp,
              });
            });
          }

          // dogStatD
          if (this.dogStatsD) {
            this.dogStatsD.gauge(
              `queue.${queueNameForGauge}.${priority}.waiting.length`,
              waitingJobIds.length
            );

            this.dogStatsD.gauge(
              `queue.${queueNameForGauge}.${priority}.processing.length`,
              validProcessingJobIds.length
            );

            if (queue.delayable) {
              this.dogStatsD.gauge(
                `queue.${queueNameForGauge}.${priority}.delayed.length`,
                filteredDelayedJobs.length
              );
            }
          }
        });
      }),
    ]);

    this.logger.info("job lists updated", {
      lockMissingJobsIdsSetSize: this.lockMissingJobsIdsSet.size,
    });
  };

  /**
   * Connect to redis, start the monitoring
   */
  public start = async () => {
    await this.redis.connect();
    this.timer = setInterval(this.refreshQueueList, this.intervalMs);
  };

  /**
   * Stop the monitoring, disconnect from redis
   */
  public stop = async () => {
    clearInterval(this.timer);
    await delay(this.intervalMs * 2);
    await this.redis.disconnect();
  };
}
