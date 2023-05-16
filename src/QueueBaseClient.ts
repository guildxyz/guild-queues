import { AnyObject, ILogger, QueueFactoryOptions, RedisClient } from "./types";
import { parse, stringify } from "./utils";

/**
 * Base class to store injected instances and their utils
 */
export default class QueueBaseClient {
  /**
   * Redis instance
   */
  protected redis: RedisClient;

  /**
   * Provided logger (no logs if null)
   */
  protected logger: ILogger;

  /**
   * Expiration time of lock keys
   */
  lockTime: number;

  /**
   * OOP boilerplate
   * @param options parameters of the QueueFactory
   */
  constructor(options: QueueFactoryOptions) {
    this.redis = options.redisClient;
    this.logger = options.logger;
    this.lockTime = options.lockTime;
  }

  /**
   * Add object's properties to Redis hash as fields
   * @param key redis key
   * @param value object
   * @returns number of fields added
   */
  protected hSetAll = async (key: string, value: any): Promise<number> =>
    this.redis.hSet(
      key,
      Object.entries(value).map<[string, string]>(([k, v]) => [k, stringify(v)])
    );

  /**
   * Query multiple Redis hash fields
   * @param key redis key
   * @param fields fields to query
   * @returns fields as object
   */
  protected hGetMore = async (
    key: string,
    fields: string[]
  ): Promise<AnyObject> => {
    if (fields.length === 0) {
      return {};
    }

    const attributes = await Promise.all(
      fields.map(async (f) => {
        const value = await this.redis.hGet(key, f);
        const parsedValue = parse(f, value);
        return [f, parsedValue];
      })
    );
    const attributesObject = Object.fromEntries(attributes);
    return attributesObject;
  };
}
