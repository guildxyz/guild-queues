import { createClient } from "redis";
import { DogStatsD, FlowMonitorOptions, ILogger, RedisClient } from "./types";
import { delay, keyFormatter } from "../utils";
import { DEFAULT_LOG_META } from "../static";

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

  constructor(options: FlowMonitorOptions) {
    const {
      redisClientOptions,
      flowName,
      queueNames,
      logger,
      dogStatsD,
      intervalMs,
    } = options;

    this.flowName = flowName;
    this.logger = logger;
    this.dogStatsD = dogStatsD;
    this.queueNames = queueNames;
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
      this.redis.hSet(jobKey, "done", '"true"'),
      this.redis.hSet(jobKey, "failed", '"true"'),
      this.redis.hSet(
        jobKey,
        "failedErrorMsg",
        `"${queueName} lock time exceeded"`
      ),
    ]);

    return false;
  };

  /**
   * Update the queue-jobs map, check all jobs' locks
   */
  private refreshQueueList = async () => {
    const newQueueJobs = new Map<string, string[]>();

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
    ]);

    this.queueJobs = newQueueJobs;
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
