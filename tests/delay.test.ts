/* eslint-disable dot-notation */
// eslint-disable-next-line import/no-extraneous-dependencies
import redisMock from "redis-mock";
import * as redis from "redis";
import Queue from "../src/base/Queue";
import Worker from "../src/base/Worker";
import { testCorrelator, testLogger, testRedisClientOptions } from "./common";
import { delay, keyFormatter } from "../src/utils";

const INTERVAL_MS = 3000;
const GROUP_KEY = "type";
const RESERVOIR = 3;
const QUEUE_INDEX = 0;

const queue = new Queue({
  queueName: "testQueue",
  attributesToGet: [],
  limiter: {
    groupJobKey: GROUP_KEY,
    intervalMs: INTERVAL_MS,
    reservoir: RESERVOIR,
  },
});

const worker = new Worker({
  correlator: testCorrelator,
  logger: testLogger,
  flowName: "testFlow",
  queues: [queue],
  redisClientOptions: testRedisClientOptions,
  workerFunction: async () => ({}),
});

const redisMockClient = redis.createClient(testRedisClientOptions);

const delayJobSpy = jest
  .spyOn(worker as any, "delayJob")
  .mockImplementation(() => {});

jest.spyOn(redis, "createClient").mockImplementation(redisMock.createClient);

let oldMockCallCount = 0;

beforeAll(async () => {
  await worker.connect();
  await redisMockClient.connect();
  await redisMockClient.flushAll();
});
afterAll(async () => {
  await worker.disconnect();
  await redisMockClient.disconnect();
});

const testDelayJobIfLimited = async (amount: number, groupCount: number) => {
  // do
  await Promise.all(
    [...Array(amount).keys()].map(async (i) => {
      // eslint-disable-next-line dot-notation
      await worker["delayJobIfLimited"](QUEUE_INDEX, {
        id: `${i}`,
        type: `${i % groupCount}`,
      } as any);
    })
  );

  // test
  expect(delayJobSpy.mock.calls.length).toBe(
    oldMockCallCount + amount - groupCount * RESERVOIR
  );
  oldMockCallCount += delayJobSpy.mock.calls.length;

  await Promise.all(
    [...Array(groupCount).keys()].map(async (i) => {
      const delayEnqueuedKey = keyFormatter.delayEnqueued(queue.name, `${i}`);
      const enqueued = await redisMockClient.get(delayEnqueuedKey);
      expect(enqueued).toBe(`${amount / groupCount - RESERVOIR}`);
      // cleanup, we don't test decrementing the enqueued count here, that happens after the job executed
      await redisMockClient.del(delayEnqueuedKey);
    })
  );
};

describe("delay", () => {
  test("test delayJobIfLimited - executing the right number of jobs", async () => {
    const firstAmount = 10;
    const firstGroupCount = 2;
    await testDelayJobIfLimited(firstAmount, firstGroupCount);

    await delay(INTERVAL_MS);

    const secondAmount = 60;
    const secondGroupCount = 4;
    await testDelayJobIfLimited(secondAmount, secondGroupCount);
  });
});
