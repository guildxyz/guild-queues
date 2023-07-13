import { createClient } from "redis";
import { FlowMonitorOptions, ILogger, RedisClient } from "./types";
import { delay, keyFormatter } from "../utils";

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
   * Names of the flow's queues
   */
  private queueNames: string[];

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
  private queueJobs = new Map<string, string[]>();

  constructor(options: FlowMonitorOptions) {
    const { redisClientOptions, flowName, queueNames, logger, intervalMs } =
      options;

    this.flowName = flowName;
    this.logger = logger;
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
  checkJobLock = async (queueName: string, jobId: string) => {
    const lock = await this.redis.get(keyFormatter.lock(queueName, jobId));
    if (lock) {
      return true;
    }

    this.logger.info("Job lock time exceeded", {
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
        const waitingQueueName = keyFormatter.waitingQueueName(queueName);
        const jobIds = await this.redis.lRange(waitingQueueName, 0, 1);
        newQueueJobs.set(waitingQueueName, jobIds);
      }),
      this.queueNames.map(async (queueName) => {
        const processingQueueName = keyFormatter.processingQueueName(queueName);
        const jobIds = await this.redis.lRange(processingQueueName, 0, 1);

        const validJobIds = (
          await Promise.all(
            jobIds.map(async (jobId) => ({
              jobId,
              valid: await this.checkJobLock(queueName, jobId),
            }))
          )
        )
          .filter(({ valid }) => !!valid)
          .map(({ jobId }) => jobId);

        newQueueJobs.set(processingQueueName, validJobIds);
      }),
    ]);

    this.queueJobs = newQueueJobs;
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
