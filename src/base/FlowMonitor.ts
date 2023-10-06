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

type DelayedJob = { jobId: string; readyTimestamp: number };

/**
 * Defines a entity which periodically checks and stores the queues' content of a flow
 */
export default class FlowMonitor {
  /**
   * The flow that is being monitored
   */
  private flowName: string;

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
   * Names of the flow's queues
   */
  public queueNames: string[];

  /**
   * Names of the flow's delayed queues
   */
  public delayedQueueNames: string[];

  /**
   * Update interval in milliseconds
   */
  private intervalMs: number;

  /**
   * Timer object which checks periodically
   */
  private timer: ReturnType<typeof setInterval>;

  /**
   * Map which stores the queues and their content
   */
  public queueJobs = new Map<string, string[]>();

  public delayedQueueJobs = new Map<string, DelayedJob[]>();

  constructor(options: FlowMonitorOptions) {
    const {
      redisClientOptions,
      flowName,
      queueNames,
      logger,
      dogStatsD,
      delayedQueueNames,
      intervalMs,
    } = options;

    this.flowName = flowName;
    this.logger = logger;
    this.dogStatsD = dogStatsD;
    this.queueNames = queueNames;
    this.delayedQueueNames = delayedQueueNames;
    this.intervalMs = intervalMs || 1000;

    this.redis = createClient(redisClientOptions);
  }

  /**
   * Check if there's a lock for a given job of a queue
   * @param queueName name of the queue
   * @param jobId id of the job
   * @returns whether there's a lock associated with it
   */
  private checkJobLock = async (queueName: string, jobId: string) => {
    const lock = await this.redis.get(keyFormatter.lock(queueName, jobId));
    if (lock) {
      return true;
    }

    this.logger.info("Job lock time exceeded", {
      ...DEFAULT_LOG_META,
      queueName,
      flowName: this.flowName,
      jobId,
    });

    const jobKey = keyFormatter.job(this.flowName, jobId);
    await Promise.all([
      this.redis.lRem(keyFormatter.processingQueueName(queueName), 1, jobId),
      this.redis.hSet(jobKey, DONE_FIELD, "true"),
      this.redis.hSet(jobKey, FAILED_FIELD, "true"),
      this.redis.hSet(jobKey, FAILED_QUEUE_FIELD, queueName),
      this.redis.hSet(
        jobKey,
        FAILED_ERROR_MSG_FIELD,
        `"${queueName} lock time exceeded"`
      ),
    ]);

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

    const delayedQueueName = keyFormatter.delayedQueueName(queueName);
    const waitingQueueName = keyFormatter.waitingQueueName(queueName);

    await this.redis
      .multi()
      .lPush(waitingQueueName, jobIdsToResume)
      .zRem(delayedQueueName, jobIdsToResume)
      .exec();

    jobIdsToResume.forEach((jobId) => {
      this.logger.info("Job resumed", {
        ...DEFAULT_LOG_META,
        queueName,
        flowName: this.flowName,
        jobId,
      });
    });

    return delayedJobs.filter((job) => !jobIdsToResume.includes(job.jobId));
  };

  /**
   * Update the queue-jobs map, check all jobs' locks
   */
  private refreshQueueList = async () => {
    const newQueueJobs = new Map<string, string[]>();
    const newDelayedQueueJobs = new Map<string, DelayedJob[]>();

    await Promise.all([
      this.queueNames.map(async (queueName) => {
        const queueNameForGauge = queueName.replaceAll(":", ".");

        const waitingQueueName = keyFormatter.waitingQueueName(queueName);
        const waitingJobIds = await this.redis.lRange(waitingQueueName, 0, -1);

        this.dogStatsD?.gauge(
          `queue.${queueNameForGauge}.waiting.length`,
          waitingJobIds.length
        );
        newQueueJobs.set(waitingQueueName, waitingJobIds);

        const processingQueueName = keyFormatter.processingQueueName(queueName);
        const processingJobIds = await this.redis.lRange(
          processingQueueName,
          0,
          -1
        );

        const validProcessingJobIds = (
          await Promise.all(
            processingJobIds.map(async (jobId) => ({
              jobId,
              valid: await this.checkJobLock(queueName, jobId),
            }))
          )
        )
          .filter(({ valid }) => !!valid)
          .map(({ jobId }) => jobId);

        this.dogStatsD?.gauge(
          `queue.${queueNameForGauge}.processing.length`,
          validProcessingJobIds.length
        );

        newQueueJobs.set(processingQueueName, validProcessingJobIds);
      }),
      this.delayedQueueNames.map(async (queueName) => {
        const queueNameForGauge = queueName.replaceAll(":", ".");

        const delayedQueueName = keyFormatter.delayedQueueName(queueName);
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

        const filteredDelayedJobs = await this.resumeDelayedJobs(
          queueName,
          delayedJobs
        );

        this.dogStatsD?.gauge(
          `queue.${queueNameForGauge}.delayed.length`,
          filteredDelayedJobs.length
        );

        newDelayedQueueJobs.set(delayedQueueName, filteredDelayedJobs);
      }),
    ]);

    this.queueJobs = newQueueJobs;
    this.delayedQueueJobs = newDelayedQueueJobs;
    this.logger.info("job lists updated", {
      flowName: this.flowName,
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
