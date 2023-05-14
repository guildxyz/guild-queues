import { createClient } from "redis";

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

export type RedisClient = ReturnType<typeof createClient>;

export type QueueClientOptions = {
  redisClient: RedisClient;
  queueName: string;
  nextQueueName?: string;
  logger?: ILogger;
  lockTime?: number;
  keyPrefix?: string;
};

export type HasId = {
  id: string;
  [key: string]: unknown;
};
