/* eslint-disable no-await-in-loop */
import { v4 as uuidV4 } from "uuid";
import { createClient } from "redis";
import Queue from "./Queue";
import {
  BaseJobParams,
  WorkerFunction,
  ILogger,
  RedisClient,
  WorkerOptions,
  IConnectable,
  IStartable,
  BaseJobResult,
  AnyObject,
} from "./types";
import { hGetMore, hSetMore } from "../utils";

/**
 * Defines a worker, the framework for job execution
 */
export default class Worker<
  Params extends BaseJobParams,
  Result extends BaseJobResult
> implements IConnectable, IStartable
{
  /**
   * Uuid of the worker
   */
  public readonly id: string;

  /**
   * Prefix of the flow this worker belongs to
   */
  public readonly flowPrefix: string;

  /**
   * The queue to work on
   */
  public readonly queue: Queue;

  /**
   * The job processing function definition
   */
  protected workerFunction: WorkerFunction<Params, Result>;

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
  public nonBlockingRedis: RedisClient;

  /**
   * Loop for running jobs
   */
  private scheduler: Promise<void>;

  /**
   * Expiration time of lock keys
   */
  public lockTime: number;

  /**
   * Maximum number of seconds to wait for job before checking status
   */
  public waitingTimeout: number;

  /**
   * Status of the worker
   */
  public status: "ready" | "running" | "stopping" | "stopped";

  /**
   * Set the properties, generate workerId, initialize redis clients
   * @param options
   */
  constructor(options: WorkerOptions<Params, Result>) {
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
   * Lock a job for execution and return it
   * @param timeout maximum number of seconds to block (zero means block indefinitely)
   * @returns the job
   */
  protected async lease(timeout: number): Promise<Params> {
    // move a job from the waiting queue to the processing queue
    const jobId: string = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    // set a lock for the job with expiration
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTime,
    });

    // get the flow's state attributes
    const flowKey = `${this.flowPrefix}:${jobId}`;
    const attributes = await hGetMore(
      this.nonBlockingRedis,
      flowKey,
      this.queue.attributesToGet
    );

    this.logger?.info("Worker leased job", {
      queueName: this.queue.name,
      flowPrefix: this.flowPrefix,
      workerId: this.id,
      jobId,
    });

    // return job with flowId
    return { id: jobId, ...attributes } as Params;
  }

  /**
   * Updates the flow's status, removed the specified job from the queue and adds it to the next one
   * @param jobId the job's id
   * @param result the result of the job
   * @returns whether it was successful
   */
  protected async complete(jobId: string, result?: Result): Promise<boolean> {
    const flowKey = `${this.flowPrefix}:${jobId}`;
    const { nextQueue } = result;

    const propertiesToSave: AnyObject = result;
    delete propertiesToSave.nextQueue;
    propertiesToSave["completed-queue"] = this.queue.name;

    // save the result
    await hSetMore(this.nonBlockingRedis, flowKey, propertiesToSave);

    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    const nextQueueKey = nextQueue
      ? `${Queue.keyPrefix}:${nextQueue}:waiting`
      : this.queue.nextQueueKey;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // put job to next queue (if there's a next queue)
    if (nextQueueKey) {
      transaction.rPush(nextQueueKey, jobId);
    }

    // remove it from the current one
    transaction.lRem(this.queue.processingQueueKey, 1, jobId).del(itemLockKey);

    const [_, removedItemCount, removedLockCount] = await transaction.exec();

    // check if the job was remove successfully from the current queue
    if (+removedItemCount > 0) {
      this.logger?.info("Worker completed a job", {
        queueName: this.queue.name,
        flowPredix: this.flowPrefix,
        workerId: this.id,
        removedLockCount,
      });
      return true;
    }

    // else: the item was not present in the current queue (inconsistency)
    // try to abort it: remove from the next queue (if there's a next queue)
    let abortSuccessful: boolean;
    if (nextQueueKey) {
      const abortResult = await this.nonBlockingRedis.lRem(
        this.queue.nextQueueKey,
        -1,
        jobId
      );
      abortSuccessful = abortResult === 1;
    }

    this.logger?.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        name: this.queue.name,
        processingQueueKey: this.queue.processingQueueKey,
        jobId,
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
   * Start the job execution
   */
  public start = async () => {
    this.logger?.info("Starting worker", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
    });

    // set state to to running
    this.status = "running";

    // start a loop for job execution
    this.scheduler = (async () => {
      try {
        while (this.status === "running") {
          const job = await this.lease(this.waitingTimeout);

          // if there's a job execute it
          if (job) {
            let result: Result;
            try {
              result = await this.workerFunction(job);
            } catch (workerFunctionError: any) {
              await this.handleWorkerFunctionError(job.id, workerFunctionError);
            }

            if (result) {
              await this.complete(job.id, result);
            }
          }
          // else check if worker is still running and retry
        }
      } catch (error) {
        this.logger?.error("Worker died", {
          queueName: this.queue.name,
          flowPredix: this.flowPrefix,
          workerId: this.id,
          error,
        });
        // TODO: call disconnect here?
      }
    })();

    this.logger?.info("Worker started", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
    });
  };

  private handleWorkerFunctionError = async (jobId: string, error: any) => {
    this.logger?.warn("WorkerFunction failed", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      jobId,
      error,
    });

    const flowKey = `${this.flowPrefix}:${
      jobId.includes(":") ? jobId.split(":")[0] : jobId
    }`;
    const propertiesToSave = {
      failed: true,
      failedErrorMsg: error.message,
    };

    await hSetMore(this.nonBlockingRedis, flowKey, propertiesToSave).catch(
      (err) => {
        this.logger?.error('Failed to set "failed" properties', {
          queueName: this.queue.name,
          flowPredix: this.flowPrefix,
          workerId: this.id,
          jobId,
          jobError: error.message,
          error: err,
        });
      }
    );
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
