import { createClient } from "redis";
import { QueueFactoryOptions } from "../src/types";

export const REDIS_CLIENT = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  database: 15,
});

export const TEST_OPTIONS: QueueFactoryOptions = {
  redisClient: REDIS_CLIENT,
};

export const TEST_USER_ID = 999;
export const TEST_ROLE_IDS = [123, 456, 789];

export const TEST_FLOW_OPTIONS = {
  userId: TEST_USER_ID,
  roleIds: TEST_ROLE_IDS,
  recheckAccess: true,
  updateMemberships: true,
  manageRewards: true,
  forceRewardActions: false,
  priority: 1,
};
