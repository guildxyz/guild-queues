import { createClient } from "redis";
import { AccessFlowOptions, CreateAccessFlowOptions } from "../src/types";

export const REDIS_CLIENT_OPTIONS = {
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  database: 15,
};

export const REDIS_CLIENT = createClient(REDIS_CLIENT_OPTIONS);

export const TEST_ACCESS_FLOW_OPTIONS: AccessFlowOptions = {
  redisClientOptions: REDIS_CLIENT_OPTIONS,
};

export const TEST_USER_ID = 999;
export const TEST_GUILD_ID = 8453;
export const TEST_ROLE_IDS = [123, 456, 789];

export const TEST_FLOW_OPTIONS: CreateAccessFlowOptions = {
  guildId: TEST_GUILD_ID,
  userId: TEST_USER_ID,
  roleIds: TEST_ROLE_IDS,
  recheckAccess: true,
  updateMemberships: true,
  manageRewards: true,
  forceRewardActions: false,
  priority: 1,
};
