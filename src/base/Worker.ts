/* eslint-disable no-await-in-loop */
import { v4 as uuidV4 } from "uuid";
import { createClient } from "redis";
import Queue from "./Queue";
import {
  BaseJob,
  WorkerFunction,
  ILogger,
  RedisClient,
  WorkerOptions,
  IConnectable,
  IStartable,
} from "./types";

/**
 * Defines a worker, the framework for job execution
 */
export default abstract class Worker<
  QueueName extends string,
  Job extends BaseJob,
  Result
> implements IConnectable, IStartable
{
  /**
   * Uuid of the worker
   */
  readonly id: string;

  /**
   * Prefix of the flow this worker belongs to
   */
  readonly flowPrefix: string;

  /**
   * The queue to work on
   */
  readonly queue: Queue<QueueName>;

  /**
   * The job processing function definition
   */
  readonly workerFunction: WorkerFunction<Job, Result>;

  /**
   * Provided logger (no logs if null)
   */
  protected logger: ILogger;

  /**
   * Redis instance for blocking operations
   */
  protected blockingRedis: RedisClient;

  /**
   * Redis instance for non-blocking operations
   */
  protected nonBlockingRedis: RedisClient;

  /**
   * Loop for running jobs
   */
  private scheduler: Promise<void>;

  /**
   * Expiration time of lock keys
   */
  lockTime: number;

  /**
   * Maximum number of seconds to wait for job before checking status
   */
  waitingTimeout: number;

  /**
   * Status of the worker
   */
  status: "ready" | "running" | "stopping" | "stopped";

  /**
   * Set the properties, generate workerId, initialize redis clients
   * @param options
   */
  constructor(options: WorkerOptions<QueueName, Job, Result>) {
    const defaultValues = {
      lockTime: 60 * 3,
      waitingTimeout: 0,
    };

    const {
      queue,
      flowPrefix,
      workerFunction,
      logger,
      redisClientOptions,
      lockTime,
      waitingTimeout,
    } = { ...defaultValues, ...options };

    this.queue = queue;
    this.flowPrefix = flowPrefix;
    this.logger = logger;
    this.lockTime = lockTime;
    this.waitingTimeout = waitingTimeout;
    this.workerFunction = workerFunction;
    this.blockingRedis = createClient(redisClientOptions);
    this.nonBlockingRedis = createClient(redisClientOptions);
    this.id = uuidV4();
    this.status = "ready";
  }

  /**
   * Should lock a job for execution and return it
   * @param timeout maximum number of seconds to block (zero means block indefinitely)
   * @returns the job
   */
  protected abstract lease(timeout: number): Promise<Job>;

  /**
   * Should updates the flow's status, removed the specified job from the queue and adds it to the next one
   * @param jobId the job's id
   * @param result the result of the job
   * @returns whether it was successful
   */
  protected abstract complete(jobId: string, result?: Result): Promise<boolean>;

  /**
   * Connect to redis client
   */
  public connect = async () => {
    await this.blockingRedis.connect();
    await this.nonBlockingRedis.connect();
    return this;
  };

  /**
   * Disconnect from redis client
   */
  public disconnect = async () => {
    await this.blockingRedis.disconnect();
    await this.nonBlockingRedis.disconnect();
    return this;
  };

  /**
   * Start the job execution
   */
  public start = async () => {
    this.logger?.info("Starting worker", {
      queueName: this.queue.name,
      workerId: this.id,
    });

    // set state to to running
    this.status = "running";

    // start a loop for job execution
    this.scheduler = (async () => {
      while (this.status === "running") {
        const job = await this.lease(this.waitingTimeout);

        // if there's a job execute it
        if (job) {
          const result = await this.workerFunction(job);
          await this.complete(job.id, result);
        }
        // else check if worker is still running and retry
      }
    })();

    this.logger?.info("Worker started");
  };

  /**
   * Stop the job execution (the current job will be completed)
   */
  public stop = async () => {
    this.logger?.info("Stopping worker", {
      queueName: this.queue.name,
      workerId: this.id,
    });

    // notify scheduler to stop the execution
    this.status = "stopping";
    // wait until the scheduler is stopped
    await this.scheduler;
    // mark status as stopped
    this.status = "stopped";

    this.logger?.info("Worker stopped");
  };
}
