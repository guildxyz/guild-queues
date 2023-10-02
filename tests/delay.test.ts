import Queue from "../src/base/Queue";
import Worker from "../src/base/Worker";
import { testCorrelator, testLogger, testRedisClientOptions } from "./common";

const queue = new Queue({
  queueName: "testQueue",
  attributesToGet: [],
  limiter: { groupJobKey: "type", intervalMs: 5000, reservoir: 3 },
});

const worker = new Worker({
  correlator: testCorrelator,
  logger: testLogger,
  flowName: "testFlow",
  queues: [queue],
  redisClientOptions: testRedisClientOptions,
  workerFunction: async () => ({}),
});

const delayJobSply = jest
  .spyOn(worker as any, "delayJob")
  .mockImplementation(() => {});

beforeAll(async () => {
  await worker.connect();
});
afterAll(async () => {
  await worker.disconnect();
});

describe("delay test", () => {
  test("test delay", async () => {
    await Promise.all(
      [...Array(10).keys()].map(async (i) => {
        // eslint-disable-next-line dot-notation
        await worker["delayJobIfLimited"](0, { id: `${i}`, type: `${i % 2}` });
      })
    );

    expect(delayJobSply.mock.calls.length).toBe(6);
  });
});
