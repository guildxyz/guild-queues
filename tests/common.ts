import { createClient } from "redis";
import { ICorrelator, ILogger } from "../src/base/types";

export const testRedisClientOptions = {
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  database: 15,
};

export const testRedisClient = createClient(testRedisClientOptions);

export const testCorrelator: ICorrelator = {
  getId: () => "abc",
  withId(id, work) {
    work();
  },
};

export const testLogger: ILogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  verbose: () => {},
  debug: () => {},
};
