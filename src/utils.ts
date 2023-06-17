import { AnyObject, RedisClient } from "./base/types";

/**
 * Parse object retrieved by HGETs or HGETALL which consists of JSON values
 * @param obj Object retrieved by HGETs or HGETALL
 * @returns Fully parsed object
 */
export const parseObject = (obj: { [key: string]: string }) =>
  Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, JSON.parse(value)])
  );

/**
 * Stringify object fields (for HSET)
 * @param obj Object to stringify
 * @returns Array of string-string key-value pairs
 */
export const objectToStringEntries = (obj: any): [string, string][] =>
  Object.entries(obj).map<[string, string]>(([k, v]) => [k, JSON.stringify(v)]);

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
): Promise<number> => redis.hSet(key, objectToStringEntries(value));

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
      const parsedValue = JSON.parse(value);
      return [f, parsedValue];
    })
  );
  const attributesObject = Object.fromEntries(attributes);
  return attributesObject;
};

/**
 * Wait X milliseconds
 * @param ms milliseconds to wait
 * @returns Promise to await
 */
export const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
