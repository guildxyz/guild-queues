import { uuidv7 } from "uuidv7";
import { AnyObject, ICorrelator, RedisClient } from "./base/types";
import { FlowNames } from "./flows/types";
import {
  COUNTER_KEY_PREFIX,
  JOB_KEY_PREFIX,
  LOCK_KEY_PREFIX,
  QUEUE_KEY_PREFIX,
} from "./static";

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
  Object.entries(obj)
    .map<[string, string]>(([k, v]) => [k, JSON.stringify(v)])
    .filter(([, v]) => v !== null && v !== undefined);

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
      // TODO: use HMGET?
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

export const keyFormatter = {
  job: (jobId: string) => `${JOB_KEY_PREFIX}:${jobId}`,
  lookup: (
    flowName: FlowNames,
    lookupAttribute: string,
    lookupAttributeValue: string | number
  ) =>
    `${JOB_KEY_PREFIX}:${flowName}:${lookupAttribute}:${lookupAttributeValue}`,
  lock: (queueName: string, jobId: string) =>
    `${LOCK_KEY_PREFIX}:${queueName}:${jobId}`,
  childQueueName: (parentQueueName: string, childName: string) =>
    `${parentQueueName}:${childName}`,
  processingQueueName: (queueName: string, priority: number) =>
    `${QUEUE_KEY_PREFIX}:${queueName}:${priority}:processing`,
  waitingQueueName: (queueName: string, priority: number) =>
    `${QUEUE_KEY_PREFIX}:${queueName}:${priority}:waiting`,
  delayedQueueName: (queueName: string, priority: number) =>
    `${QUEUE_KEY_PREFIX}:${queueName}:${priority}:delayed`,
  childrenParams: (parentQueueName: string) =>
    `children:${parentQueueName}:params`,
  childrenJobs: (parentQueueName: string) => `children:${parentQueueName}:jobs`,
  childWaitingQueueName: (
    childGroup: string,
    childName: string,
    priority: number
  ) => `${QUEUE_KEY_PREFIX}:${childGroup}:${childName}:${priority}:waiting`,
  delayCalls: (
    queueName: string,
    groupName: string,
    currentTimeWindow: number
  ) =>
    `${COUNTER_KEY_PREFIX}:delay:calls:${queueName}:${groupName}:${currentTimeWindow}`,
  delayEnqueued: (queueName: string, groupName: string) =>
    `${COUNTER_KEY_PREFIX}:delay:enqueued:${queueName}:${groupName}`,
};

export const getLookupKeys = (
  flowName: FlowNames,
  createJobOptions: AnyObject,
  lookupAttributes: string[]
) => {
  const lookupKeys: string[] = [];
  lookupAttributes.forEach((lookupAttribute) => {
    if (
      typeof createJobOptions[lookupAttribute] === "string" ||
      typeof createJobOptions[lookupAttribute] === "number"
    ) {
      // if attribute is primitive add it
      const key = keyFormatter.lookup(
        flowName,
        lookupAttribute,
        createJobOptions[lookupAttribute]
      );
      lookupKeys.push(key);
    } else if (createJobOptions[lookupAttribute] instanceof Array) {
      // extra check for elements
      // if it's an array, add for each element
      createJobOptions[lookupAttribute].forEach((element: any) => {
        const key = keyFormatter.lookup(flowName, lookupAttribute, element);
        lookupKeys.push(key);
      });
    }
  });
  return lookupKeys;
};

export const generateJobId = (flowName: string) => `${flowName}:${uuidv7()}`;

export const extractFlowNameFromJobId = (jobId: string) =>
  jobId.split(":")?.slice(0, -1).join(":");

export const bindIdToCorrelator = async (
  correlator: ICorrelator,
  id: string,
  callback: () => Promise<void>
) => {
  (correlator as any)()({ get: () => id }, null, callback);
};
