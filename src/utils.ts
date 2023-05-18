import { AnyObject, RedisClient } from "./types";

export const stringify = (value: any): string => {
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value.join(",");
  }

  switch (typeof value) {
    case "string":
      return value;
    case "object":
      return JSON.stringify(value);
    case "number":
    case "bigint":
    case "boolean":
    default:
      return value.toString();
  }
};

type KeyType = "number" | "number[]" | "boolean" | "string" | "object";
const keyTypeMap = new Map<string, KeyType>([
  ["userId", "number"],
  ["roleIds", "number[]"],
  ["priority", "number"],
  ["recheckAccess", "boolean"],
  ["updateMemberships", "boolean"],
  ["manageRewards", "boolean"],
  ["forceRewardActions", "boolean"],
  ["onlyForThisPlatform", "string"],
]);

export const parse = (keyName: string, value: string) => {
  const typeOfKey = keyTypeMap.get(keyName);
  switch (typeOfKey) {
    case "number":
      return +value;
    case "number[]":
      return value.split(",").map((x) => +x);
    case "boolean":
      return value === "true";
    case "object":
      return JSON.parse(value);
    case "string":
    default:
      return value;
  }
};

/**
 * Add object's properties to Redis hash as fields
 * @param key redis key
 * @param value object
 * @returns number of fields added
 */
export const hSetMore = async (
  redis: RedisClient,
  key: string,
  value: any
): Promise<number> =>
  redis.hSet(
    key,
    Object.entries(value).map<[string, string]>(([k, v]) => [k, stringify(v)])
  );

/**
 * Query multiple Redis hash fields
 * @param key redis key
 * @param fields fields to query
 * @returns fields as object
 */
export const hGetMore = async (
  redis: RedisClient,
  key: string,
  fields: string[]
): Promise<AnyObject> => {
  if (fields.length === 0) {
    return {};
  }

  const attributes = await Promise.all(
    fields.map(async (f) => {
      const value = await redis.hGet(key, f);
      const parsedValue = parse(f, value);
      return [f, parsedValue];
    })
  );
  const attributesObject = Object.fromEntries(attributes);
  return attributesObject;
};
