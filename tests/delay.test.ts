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

const testDelay = async (amount: number, groupCount: number) => {
  await Promise.all(
    [...Array(amount).keys()].map(async (i) => {
      // eslint-disable-next-line dot-notation
      await worker["delayJobIfLimited"](QUEUE_INDEX, {
        id: `${i}`,
        type: `${i % groupCount}`,
      });
    })
  );

  expect(delayJobSpy.mock.calls.length).toBe(
    oldMockCallCount + amount - groupCount * RESERVOIR
  );
  oldMockCallCount += delayJobSpy.mock.calls.length;

  await Promise.all(
    [...Array(groupCount).keys()].map(async (i) => {
      const enqueued = await redisMockClient.get(
        keyFormatter.delayEnqueued(queue.name, `${i}`)
      );
      expect(enqueued).toBe(`${amount / groupCount - RESERVOIR}`);
    })
  );
};

describe("delay test", () => {
  test("test delay", async () => {
    const firstAmount = 10;
    const firstGroupCount = 2;
    await testDelay(firstAmount, firstGroupCount);

    await delay(3000);

    const secondAmount = 60;
    const secondGroupCount = 4;
    await testDelay(secondAmount, secondGroupCount);
  });
});
