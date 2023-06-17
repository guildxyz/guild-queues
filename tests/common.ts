import { createClient } from "redis";
import {
  BaseJobParams,
  BaseJobResult,
  FlowOptions,
  ILogger,
} from "../src/base/types";

/* ========== Redis ========== */

export const REDIS_CLIENT_OPTIONS = {
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  database: 15,
};

export const REDIS_CLIENT = createClient(REDIS_CLIENT_OPTIONS);

/* ========== Logger ========== */

const TEST_LOGGER: ILogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  verbose: () => {},
  debug: () => {},
};

/* ========== Test types ========== */

export type TestJob1Params = BaseJobParams & {
  userId: number;
  guildId: number;
};

export type TestJob1Result = BaseJobResult & {
  access: boolean;
};

export type TestJob1 = {
  queueName: "test1";
  params: TestJob1Params;
  result: TestJob1Result;
};

export type TestFlowCreateOptions = FlowOptions & {
  userId: number;
  guildId: number;
};

export type TestFlowLookupAttributes = "userId" | "guildId";

/* ========== Test values ========== */

export const TEST_USER_ID = 999;
export const TEST_GUILD_ID = 8453;
export const TEST_LOOKUP_ATTRIBUTES = ["userId", "guildId"];

export const TEST_QUEUE_1_NAME = "test1";
export const TEST_QUEUE_1_ATTRIBUTES_TO_GET = ["userId", "guildId"];

export const TEST_QUEUE_2_NAME = "test2";

export const TEST_FLOW_OPTIONS: TestFlowCreateOptions = {
  redisClientOptions: REDIS_CLIENT_OPTIONS,
  logger: TEST_LOGGER,
  guildId: TEST_GUILD_ID,
  userId: TEST_USER_ID,
  lookupAttributes: TEST_LOOKUP_ATTRIBUTES,
  name: "test-flow",
  queueOptions: [
    {
      queueName: TEST_QUEUE_1_NAME,
      attributesToGet: TEST_QUEUE_1_ATTRIBUTES_TO_GET,
      nextQueueName: TEST_QUEUE_2_NAME,
    },
  ],
};
