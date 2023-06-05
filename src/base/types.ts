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

export type QueueOptions = {
  queueName: string;
  nextQueueName?: string;
  attributesToGet?: string[];
};

export type WorkerOptions<Job extends BaseJob, Result> = {
  queue: Queue;
  workerFunction: WorkerFunction<Job, Result>;
  logger?: ILogger;
  lockTime?: number;
  waitTimeout?: number;
  redisClientOptions: RedisClientOptions;
};
