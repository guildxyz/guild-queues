/* eslint-disable no-await-in-loop */
import { v4 as uuidV4 } from "uuid";
import { createClient } from "redis";
import Queue from "./Queue";
import {
  AnyObject,
  BaseJob,
  BaseResult,
  FlowId,
  ILogger,
  RedisClient,
  WorkerFunction,
  WorkerOptions,
} from "../types";
import { hGetMore, hSetMore } from "../utils";

/**
 * Defines a worker, the framework for job execution
 */
export default class Worker<Job extends BaseJob, Result extends BaseResult> {
  /**
   * Uuid of the worker
   */
  readonly id: string;

  /**
   * The queue to work on
   */
  readonly queue: Queue;

  /**
   * The job processing function definition
   */
  readonly workerFunction: WorkerFunction<Job, Result>;

  /**
   * Provided logger (no logs if null)
   */
  private logger: ILogger;

  /**
   * Redis instance for blocking operations
   */
  private blockingRedis: RedisClient;

  /**
   * Redis instance for non-blocking operations
   */
  private nonBlockingRedis: RedisClient;

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
  constructor(options: WorkerOptions<Job, Result>) {
    const defaultValues = {
      lockTime: 60 * 3,
      waitingTimeout: 0,
    };

    const {
      queue,
      workerFunction,
      logger,
      redisClientOptions,
      lockTime,
      waitingTimeout,
    } = { ...defaultValues, ...options };

    this.queue = queue;
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
  private async lease(timeout: number): Promise<Job> {
    // move a job from the waiting queue to the processing queue
    const flowId: FlowId = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    // set a lock for the job with expiration
    const itemLockKey = `${this.queue.lockPrefixKey}:${flowId}`;
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTime,
    });

    // get the flow's state attributes
    const flowKey = `flow:${flowId}`;
    const attributes = await hGetMore(
      this.nonBlockingRedis,
      flowKey,
      this.queue.attributesToGet
    );

    // return job with flowId
    return { flowId, ...attributes } as Job;
  }

  /**
   * Updates the flow's status, removed the specified job from the queue and adds it to the next one
   * @param flowId the job's flow id
   * @param result the result of the job
   * @returns whether it was successful
   */
  private async complete(flowId: FlowId, result?: Result): Promise<boolean> {
    const flowKey = `flow:${flowId}`;
    const { nextQueue } = result;

    const propertiesToSave: AnyObject = result;
    delete propertiesToSave.nextQueue;
    propertiesToSave.status = `${this.queue.name} done`;

    // save the result
    await hSetMore(this.nonBlockingRedis, flowKey, propertiesToSave);

    const itemLockKey = `${this.queue.lockPrefixKey}:${flowId}`;
    const nextQueueKey = nextQueue
      ? `queue:${nextQueue}:waiting`
      : this.queue.nextQueueKey;

    // put job to next queue, and remove it from the current one
    const [_, removedItemCount, removedLockCount] = await this.nonBlockingRedis
      .multi()
      .rPush(nextQueueKey, flowId)
      .lRem(this.queue.processingQueueKey, 1, flowId)
      .del(itemLockKey)
      .exec();

    // check if the job was remove successfully from the current queue
    if (+removedItemCount > 0) {
      this.logger?.debug("complete succeed", { removedLockCount });
      return true;
    }

    // if the item was not present in the current queue (inconsistency)
    // try to abort it: remove from the next queue
    const abortResult = await this.nonBlockingRedis.lRem(
      this.queue.nextQueueKey,
      -1,
      flowId
    );

    this.logger?.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        name: this.queue.name,
        processingQueueKey: this.queue.processingQueueKey,
        flowId,
        abortResult,
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
          await this.complete(job.flowId, result);
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
