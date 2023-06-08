import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";

/* Interfaces */

/**
 * Log method which accepts a message and optionally the metadata
 */
interface ILogMethod {
  (message: string, meta?: any): any;
}

/**
 * Accepted logger interface
 */
export interface ILogger {
  debug: ILogMethod;
  error: ILogMethod;
  warn: ILogMethod;
  info: ILogMethod;
  verbose: ILogMethod;
}

/**
 * Has connect and disconnect method
 */
export interface IConnectable {
  connect(): void;
  disconnect(): void;
}

/**
 * Has start and stop method
 */
export interface IStartable {
  start(): void;
  stop(): void;
}

/* Aliases */

/**
 * Redis client instance
 */
export type RedisClient = ReturnType<typeof createClient>;

/**
 * Object with any string properties
 */
export type AnyObject = { [key: string]: any };

/* Base types */

/**
 * A minimal job that a Worker can work with
 */
export type BaseJob = {
  id: string;
};

/**
 * A minimal job that a PrimaryWorker can work with
 */
export type PrimaryResult<QueueName> = {
  /**
   * The queue to put the next job after the current one is finished.
   */
  nextQueue?: QueueName;
};

// Functions

/**
 * The function that the worker will execute on the jobs
 */
export type WorkerFunction<Job extends BaseJob, Result> = (
  job: Job
) => Promise<Result>;

// Options

/**
 * Basic queue options
 */
export type QueueOptions<QueueName extends string> = {
  /**
   * Name of the queue
   */
  queueName: QueueName;
  /**
   * Name of the queue to put the next job after the current one is finished
   */
  nextQueueName?: QueueName;
  /**
   * Default attributes (of the flow) necessary to execute the job
   */
  attributesToGet?: string[];
};

/**
 * Basic options of a worker
 */
export type WorkerOptions<
  QueueName extends string,
  Job extends BaseJob,
  Result
> = {
  /**
   * The queue to work on
   */
  queue: Queue<QueueName>;
  /**
   * Prefix of the flow this worker belongs to
   */
  flowPrefix: string;
  /**
   * The function to execute on jobs
   */
  workerFunction: WorkerFunction<Job, Result>;
  /**
   * Provided logger (no logs if null)
   */
  logger?: ILogger;
  /**
   * Expiration time of lock keys
   */
  lockTime?: number;
  /**
   * Maximum number of seconds to wait for job before checking status
   */
  waitTimeout?: number;
  /**
   * Options to initialize the redis clients
   */
  redisClientOptions: RedisClientOptions;
};

/**
 * Basic options to create a Flow
 */
export type FlowOptions<QueueName extends string, ChildQueueName> = {
  /**
   * Prefix of the state key-value pair's keys
   */
  prefix: string;
  /**
   * Options to create redis connections
   */
  redisClientOptions: RedisClientOptions;
  /**
   * Provided logger (no logs if null)
   */
  logger?: ILogger;
  /**
   * Options to create the Flow's Queues
   */
  queueOptions: QueueOptions<QueueName>[];
  /**
   * Options to create the Flow's child Queues
   */
  childQueueNames: ChildQueueName[];
  /**
   * Attributes which can be used for lookup a state
   */
  lookupAttributes: string[];
};
