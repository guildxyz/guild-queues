import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";

/* ========== Interfaces ========== */

/**
 * Log method which accepts a message and optionally the metadata
 */
type ILogMethod = (message: string, meta?: any) => any;

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
 * Has connect, disconnect, start and stop method
 */
export interface IStartable {
  connect(): void;
  disconnect(): void;
  start(): void;
  stop(): void;
}

/* ========== Aliases ========== */

/**
 * Redis client instance
 */
export type RedisClient = ReturnType<typeof createClient>;

/**
 * Object with any string properties
 */
export type AnyObject = { [key: string]: any };

/* Utility types */

export type ArrayElement<ArrayType> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

/* ========== Base types ========== */

/**
 * The minimal job that a Worker can work with
 */
export type BaseJobParams = {
  id: string;
};

/**
 * The minimal job result workerFunction can returng
 */
export type BaseJobResult = {
  /**
   * The queue to put the next job after the current one is finished.
   */
  nextQueue?: string;
};

/**
 * The minimal params to create child jobs
 */
export type BaseChildParam = AnyObject & {
  childName: string;
};

/**
 * Job definition for the Flow
 */
export type BaseJob = {
  queueName: string;
  children?: BaseJob[];
  params?: BaseJobParams;
  result?: BaseJobResult;
};

/* ========== Functions ========== */

/**
 * The function that the worker will execute on the jobs
 */
export type WorkerFunction<
  Params extends BaseJobParams,
  Result extends BaseJobResult
> = (job: Params) => Promise<Result>;

/* ========== Options ========== */

/**
 * Options for creating a queue
 */
export type QueueOptions = {
  /**
   * Name of the queue
   */
  queueName: string;
  /**
   * Name of the queue to put the next job after the current one is finished
   */
  nextQueueName?: string;
  /**
   * Default attributes (of the flow) necessary to execute the job
   */
  attributesToGet?: string[];

  /**
   * Options for creating the child queues
   */
  children?: QueueOptions[];
};

/**
 * Options for creating a worker
 */
export type WorkerOptions<
  Params extends BaseJobParams,
  Result extends BaseJobResult
> = {
  /**
   * The queue to work on
   */
  queue: Queue;
  /**
   * Prefix of the flow this worker belongs to
   */
  flowName: string;
  /**
   * The function to execute on jobs
   */
  workerFunction: WorkerFunction<Params, Result>;
  /**
   * Provided logger
   */
  logger: ILogger;
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
 * Options for creating a parent worker
 */
export type ParentWorkerOptions = Omit<
  WorkerOptions<BaseJobParams, null>,
  "workerFunction"
> & {
  /**
   * The parent will checks if the child jobs are running this often
   */
  checkInterval?: number;
};

/**
 * Basic options to create a Flow
 */
export type FlowOptions = {
  /**
   * Name of the flow
   */
  name: string;
  /**
   * Options to create redis connections
   */
  redisClientOptions: RedisClientOptions;
  /**
   * Provided logger (no logs if null)
   */
  logger: ILogger;
  /**
   * Options to create the Flow's Queues
   */
  queueOptions: QueueOptions[];
  /**
   * Attributes which can be used for lookup a job
   */
  lookupAttributes: string[];
};
