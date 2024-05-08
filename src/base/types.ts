// eslint-disable-next-line max-classes-per-file
import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";
import { FlowNames } from "../flows/types";
import {
  CREATED_AT_FIELD,
  DELAY_REASON_FIELD,
  DELAY_TIMESTAMP_FIELD,
  FAILED_ERROR_MSG_FIELD,
  FAILED_FIELD,
  FAILED_QUEUE_FIELD,
  IS_DELAY_FIELD,
} from "../static";
import QueuesClient from "./QueuesClient";

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
 * Can bind and provide correlation id
 */
export type ICorrelator = {
  getId: () => any;
};

/**
 * Datadog's DogStatsD interface (I would rather not import the package just for this type)
 */
export interface DogStatsD {
  increment(
    stat: string,
    value?: number,
    tags?: { [tag: string]: string | number }
  ): void;
  decrement(
    stat: string,
    value?: number,
    tags?: { [tag: string]: string | number }
  ): void;
  distribution(
    stat: string,
    value?: number,
    tags?: { [tag: string]: string | number }
  ): void;
  gauge(
    stat: string,
    value?: number,
    tags?: { [tag: string]: string | number }
  ): void;
  flush(): void;
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

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/* ========== Base types ========== */

export type Limiter = {
  id: string;
  reservoir: number;
  intervalMs: number;
  groupJobKey: string;
};

/**
 * The minimal job that a Worker can work with
 */
export type BaseJobParams = {
  id: string;
  flowName: FlowNames;
  priority: number;
  correlationId: string;
  delay?: boolean;
  retries?: number;
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

export type ManagedJobFields = {
  "completed-queue"?: string;
  [CREATED_AT_FIELD]: number;
  [FAILED_FIELD]?: boolean;
  [FAILED_ERROR_MSG_FIELD]?: string;
  [FAILED_QUEUE_FIELD]?: string;
  [IS_DELAY_FIELD]?: boolean;
  [DELAY_TIMESTAMP_FIELD]?: number;
  [DELAY_REASON_FIELD]?: string;
};

/**
 * The minimal params to create child jobs
 */
export type BaseChildParam = AnyObject & {
  childName: string;
  priority: number;
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
> = (job: Params, timeout?: ReturnType<typeof setTimeout>) => Promise<Result>;

/* ========== Options ========== */

/**
 * Options for creating a queue
 */
export type QueueOptions<NextQueueName extends string = string> = {
  /**
   * Name of the queue
   */
  queueName: string;
  /**
   * Name of the queue to put the next job after the current one is finished
   */
  nextQueueName?: NextQueueName;
  /**
   * If the queue is part of multiple flows, it probably has multiple next queues
   * This map maps the flow names to the next queues
   */
  nextQueueNameMap?: Map<string, string>;
  nextQueuePriorityDiffMap?: Map<string, number>;
  /**
   * Default attributes (of the flow) necessary to execute the job
   */
  attributesToGet?: string[];

  /**
   * Options for creating the child queues
   */
  children?: QueueOptions[];

  /**
   * Optional rate limiter options
   */
  limiter?: PartialBy<Limiter, "id" | "groupJobKey">;

  /**
   * Number of priorities for this queue
   */
  priorities?: number;

  /**
   * Whether the job is expected to be delayed
   * The flow monitor uses this info
   * If it's true it will monitor the queue's delay queue as well
   */
  delayable?: boolean;

  /**
   * Number of retries before marking the job failed.
   */
  maxRetries?: number;
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
   * The function to execute on jobs
   */
  workerFunction: WorkerFunction<Params, Result>;
  /**
   * Provided logger
   */
  logger: ILogger;
  /**
   * Expiration time of lock keys (seconds)
   */
  lockTimeSec?: number;
  /**
   * Maximum number of seconds to wait for job before checking status (seconds)
   */
  blockTimeoutSec?: number;
  /**
   * Options to initialize the redis clients
   */
  redisClientOptions: RedisClientOptions;
  correlator: ICorrelator;
  queueClient: QueuesClient;
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
  correlator: ICorrelator;
};

export type FlowMonitorOptions = {
  redisClientOptions: RedisClientOptions;
  logger: ILogger;
  dogStatsD?: DogStatsD;
  intervalMs?: number;
};

export class DelayError extends Error {
  public readyTimestamp: number;

  constructor(reason: string, readyTimestamp: number) {
    super(reason);
    this.readyTimestamp = readyTimestamp;
  }
}
