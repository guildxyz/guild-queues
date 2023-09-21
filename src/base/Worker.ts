/* eslint-disable no-await-in-loop */
import { createClient } from "redis";
import { uuidv7 } from "uuidv7";
import Queue from "./Queue";
import {
  BaseJobParams,
  WorkerFunction,
  ILogger,
  RedisClient,
  WorkerOptions,
  IStartable,
  BaseJobResult,
  AnyObject,
  ICorrelator,
} from "./types";
import { hGetMore, hSetMore, keyFormatter } from "../utils";
import {
  DEFAULT_LOCK_SEC,
  DEFAULT_LOG_META,
  DEFAULT_WAIT_TIMEOUT_SEC,
  EXTRA_LOCK_SEC,
} from "../static";

/**
 * Defines a worker, the framework for job execution
 */
export default class Worker<
  Params extends BaseJobParams,
  Result extends BaseJobResult
> implements IStartable
{
  /**
   * Uuid of the worker
   */
  public readonly id: string;

  /**
   * Name of the flow the worker belongs to
   */
  public readonly flowName: string;

  /**
   * The queue to work on
   */
  public readonly queue: Queue;

  /**
   * The job processing function definition
   */
  protected workerFunction: WorkerFunction<Params, Result>;

  /**
   * Provided logger
   */
  protected logger: ILogger;

  /**
   * Redis instance for blocking operations
   */
  private blockingRedis: RedisClient;

  /**
   * Redis instance for non-blocking operations
   */
  protected nonBlockingRedis: RedisClient;

  /**
   * Loop for running jobs
   */
  private eventLoop: Promise<void>;

  /**
   * Expiration time of lock keys (seconds)
   */
  public lockTimeSec: number;

  /**
   * Maximum number of seconds to wait for job before checking status (seconds)
   */
  public blockTimeoutSec: number; // poll period ? block timeout ?

  /**
   * Status of the worker
   */
  public status: "ready" | "running" | "stopping" | "stopped";

  /**
   * Provided correlator
   */
  private readonly correlator: ICorrelator;

  /**
   * Set the properties, generate workerId, initialize redis clients, etc.
   * @param options
   */
  constructor(options: WorkerOptions<Params, Result>) {
    const {
      queue,
      flowName,
      workerFunction,
      logger,
      redisClientOptions,
      lockTimeSec,
      blockTimeoutSec,
      correlator,
    } = options;

    this.queue = queue;
    this.flowName = flowName;
    this.logger = logger;
    this.lockTimeSec = lockTimeSec ?? DEFAULT_LOCK_SEC;
    this.blockTimeoutSec = blockTimeoutSec ?? DEFAULT_WAIT_TIMEOUT_SEC;
    this.workerFunction = workerFunction;
    this.correlator = correlator;
    this.blockingRedis = createClient(redisClientOptions);
    this.nonBlockingRedis = createClient(redisClientOptions);
    this.id = uuidv7();
    this.status = "ready";
  }

  /**
   * Lock a job for execution and return it
   * @param timeout maximum number of seconds to block (zero means block indefinitely)
   * @returns the job
   */
  private async lease(timeout: number): Promise<Params> {
    const propertiesToLog = {
      queueName: this.queue.name,
      flowName: this.flowName,
      workerId: this.id,
    };

    // move a job from the waiting queue to the processing queue
    const jobId: string = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    // skip the rest if no job is found due to timeout
    if (!jobId) {
      return null;
    }

    // set a lock for the job with expiration
    // the extra one second helps avoiding the inconsistency when
    // 1) the workerFunction is finished 1ms before the deadline but no complete is called yet
    // 2) the queue-monitor sees that the lock is expired but the job is still there, so marks it as failed
    // 3) the complete marks the job as succeed and done
    const itemLockKey = keyFormatter.lock(this.queue.name, jobId);
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTimeSec + EXTRA_LOCK_SEC,
    });

    // get the job attributes
    const jobKey = keyFormatter.job(this.flowName, jobId);
    const attributes = await hGetMore(
      this.nonBlockingRedis,
      jobKey,
      this.queue.attributesToGet
    );

    this.logger.info("Worker leased a job", {
      ...DEFAULT_LOG_META,
      ...propertiesToLog,
      jobId,
    });

    // return job with id
    return { id: jobId, ...attributes } as Params;
  }

  /**
   * Updates the job's status, removed the job from the queue and adds it to the next one
   * @param jobId the job's id
   * @param result the result of the job
   * @returns whether it was successful
   */
  private async complete(jobId: string, result?: Result): Promise<boolean> {
    const propertiesToLog = {
      ...DEFAULT_LOG_META,
      queueName: this.queue.name,
      flowName: this.flowName,
      workerId: this.id,
      jobId,
    };

    const itemLockKey = keyFormatter.lock(this.queue.name, jobId);

    const jobKey = keyFormatter.job(this.flowName, jobId);
    const { nextQueue } = result;

    const propertiesToSave: AnyObject = result;
    delete propertiesToSave.nextQueue;
    propertiesToSave["completed-queue"] = this.queue.name;

    // save the result
    await hSetMore(this.nonBlockingRedis, jobKey, propertiesToSave);

    const nextQueueKey = nextQueue
      ? keyFormatter.waitingQueueName(nextQueue)
      : this.queue.nextQueueKey;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // put job to next queue (if there's a next queue)
    if (nextQueueKey) {
      transaction.rPush(nextQueueKey, jobId);
    }

    // remove it from the current one
    transaction.lRem(this.queue.processingQueueKey, 1, jobId);

    // remove the lock too
    transaction.del(itemLockKey);

    // get the processing queues length
    transaction.lLen(this.queue.processingQueueKey);

    const [
      nextQueueLength,
      removedItemCount,
      removedLockCount,
      processingQueueLength,
    ] = await transaction.exec();

    // check if the job was removed successfully from the current queue
    if (+removedItemCount > 0) {
      this.logger.info("Worker completed a job", {
        ...propertiesToLog,
        nextQueueLength,
        removedLockCount,
        processingQueueLength,
      });
      return true;
    }

    // else: the item was not present in the current queue (inconsistency)
    // try to abort it: remove from the next queue (if there's a next queue)
    // this can happen in the key was deleted from redis
    let abortSuccessful: boolean;
    if (nextQueueKey) {
      const abortResult = await this.nonBlockingRedis.lRem(
        this.queue.nextQueueKey,
        -1,
        jobId
      );
      abortSuccessful = abortResult === 1;
    }

    this.logger.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        ...propertiesToLog,
        abortSuccessful,
      }
    );

    return false;
  }

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
   * Executes a job with a timeout lockTimeSec)
   * @param job Job to execute
   * @returns result of the job
   */
  private executeWithDeadline = async (job: Params): Promise<Result> => {
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<any>((_, reject) => {
      timeout = setTimeout(() => {
        this.logger.warn("Execution timeout exceeded", {
          ...DEFAULT_LOG_META,
          queueName: this.queue.name,
          flowName: this.flowName,
          workerId: this.id,
          lockTimeSec: this.lockTimeSec,
        });
        reject(
          new Error(`Execution timeout of ${this.lockTimeSec} seconds exceeded`)
        );
      }, this.lockTimeSec * 1000);
    });

    const result: Result = await Promise.race([
      timeoutPromise,
      this.workerFunction(job),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }

    return result;
  };

  /**
   * Loop for executing jobs until the Worker is running
   */
  private eventLoopFunction = async () => {
    while (this.status === "running") {
      try {
        // generate UUID and pass create a correlator context
        await this.correlator.withId(uuidv7(), async () => {
          const job = await this.lease(this.blockTimeoutSec);

          // if there's a job execute it
          if (job) {
            let result: Result;

            // ths isolates error boundaries between "consumer-error" and "queue-lib-error"
            try {
              result = await this.executeWithDeadline(job);
            } catch (workerFunctionError: any) {
              await this.handleWorkerFunctionError(job.id, workerFunctionError);
            }

            if (result) {
              await this.complete(job.id, result);
            }
          }
          // else check if worker is still running and retry
        });
      } catch (error) {
        this.logger.error("Event loop uncaught error", {
          ...DEFAULT_LOG_META,
          queueName: this.queue.name,
          flowName: this.flowName,
          workerId: this.id,
          error,
        });
      }
    }
  };

  /**
   * Start the job execution
   */
  public start = async () => {
    const propertiesToLog = {
      ...DEFAULT_LOG_META,
      queueName: this.queue.name,
      flowName: this.flowName,
      workerId: this.id,
    };

    this.logger.info("Starting worker", propertiesToLog);

    // set state to to running
    this.status = "running";

    // start a loop for job execution
    this.eventLoop = this.eventLoopFunction();

    this.logger.info("Worker started", propertiesToLog);
  };

  /**
   * Stop the job execution (the current job will be completed)
   */
  public stop = async () => {
    const propertiesToLog = {
      ...DEFAULT_LOG_META,
      queueName: this.queue.name,
      flowName: this.flowName,
      workerId: this.id,
    };

    this.logger.info("Stopping worker", propertiesToLog);

    // notify scheduler to stop the execution
    this.status = "stopping";
    // wait until the scheduler is stopped
    await this.eventLoop;
    // mark status as stopped
    this.status = "stopped";

    this.logger.info("Worker stopped", propertiesToLog);
  };

  /**
   * Log and save workerFunction error
   * @param jobId The jobs's id
   * @param error The error thrown by the workerFunction
   */
  private handleWorkerFunctionError = async (jobId: string, error: any) => {
    const propertiesToLog = {
      ...DEFAULT_LOG_META,
      queueName: this.queue.name,
      flowName: this.flowName,
      workerId: this.id,
      jobId,
    };

    // log the error
    this.logger.warn("WorkerFunction failed", {
      ...propertiesToLog,
      error,
    });

    const jobKey = keyFormatter.job(this.flowName, jobId);
    const propertiesToSave = {
      done: true,
      failed: true,
      failedQueue: this.queue.name,
      failedErrorMsg: error.message,
    };

    // mark the job as failed
    await hSetMore(this.nonBlockingRedis, jobKey, propertiesToSave).catch(
      (err) => {
        this.logger.error('Failed to set "failed" properties', {
          ...propertiesToLog,
          jobError: error.message,
          error: err,
        });
      }
    );

    // remove the job from the processing queue
    await this.nonBlockingRedis
      .lRem(this.queue.processingQueueKey, 1, jobId)
      .catch((err) => {
        this.logger.error("Failed to remove failed job from processing queue", {
          ...propertiesToLog,
          jobError: error.message,
          error: err,
        });
      });
  };
}
