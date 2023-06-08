import { RedisClientOptions, createClient } from "redis";
import Queue from "./Queue";

// Interfaces

interface ILogMethod {
  (message: string, meta?: any): any;
}

export interface ILogger {
  debug: ILogMethod;
  error: ILogMethod;
  warn: ILogMethod;
  info: ILogMethod;
  verbose: ILogMethod;
}

export interface IConnectable {
  connect(): void;
  disconnect(): void;
}

export interface IStartable {
  start(): void;
  stop(): void;
}

// ALiases

export type RedisClient = ReturnType<typeof createClient>;

export type AnyObject = { [key: string]: any };

export type BaseJob = {
  id: string;
};

export type PrimaryResult<QueueName> = {
  nextQueue?: QueueName;
};

// Functions

export type WorkerFunction<Job extends BaseJob, Result> = (
  job: Job
) => Promise<Result>;

// Options

export type QueueOptions<QueueName extends string> = {
  queueName: QueueName;
  nextQueueName?: QueueName;
  attributesToGet?: string[];
};

export type WorkerOptions<
  QueueName extends string,
  Job extends BaseJob,
  Result
> = {
  queue: Queue<QueueName>;
  flowPrefix: string;
  workerFunction: WorkerFunction<Job, Result>;
  logger?: ILogger;
  lockTime?: number;
  waitTimeout?: number;
  redisClientOptions: RedisClientOptions;
};

export type FlowOptions<QueueName extends string, ChildQueueName> = {
  prefix: string;
  redisClientOptions: RedisClientOptions;
  logger?: ILogger;
  queueOptions: QueueOptions<QueueName>[];
  childQueueNames: ChildQueueName[];
  lookupAttributes: string[];
};
