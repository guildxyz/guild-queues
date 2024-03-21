/* eslint-disable dot-notation */
import { Promise as BluebirdPromise } from "bluebird";
import Queue from "../src/base/Queue";
import { ILogger, WorkerOptions } from "../src/base/types";
import Worker from "../src/base/Worker";
import { testCorrelator, testRedisClientOptions } from "./common";

BluebirdPromise.config({ cancellation: true });

function sleep(ms: number) {
  return new BluebirdPromise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const queue = new Queue({
  queueName: "testQueue",
  attributesToGet: [],
});

const createLogger = (logMethod: ILogger["info"]): ILogger => ({
  error: logMethod,
  warn: logMethod,
  info: logMethod,
  verbose: logMethod,
  debug: logMethod,
});

const createWorker = (
  logger: ILogger,
  workerFunction: WorkerOptions<any, any>["workerFunction"],
  lockTimeSec: number
) =>
  new Worker({
    correlator: testCorrelator,
    logger,
    queue,
    redisClientOptions: testRedisClientOptions,
    workerFunction,
    lockTimeSec,
  });

describe("job timeout tests", () => {
  // test("job succeeds in time", async () => {
  //   const jobTimeSec = 1;
  //   const timeoutSec = 3;
  //   const testResult = { asd: "qwe" };
  //
  //   const mockLog = jest.fn();
  //
  //   const logger = createLogger(mockLog);
  //
  //   const worker = createWorker(
  //     logger,
  //     () =>
  //       new BluebirdPromise((resolve) => {
  //         sleep(jobTimeSec * 1000).then(() => {
  //           resolve(testResult);
  //         });
  //       }),
  //
  //     timeoutSec
  //   );
  //
  //   const result = await worker["executeWithDeadline"]({});
  //   expect(result).toBe(testResult);
  //
  //   // no "Execution timeout exceeded" log
  //   expect(mockLog.mock.calls.length).toBe(0);
  // });
  //
  // test("job timeout happens", async () => {
  //   const jobTimeSec = 3;
  //   const timeoutSec = 1;
  //   const testResult = { asd: "qwe" };
  //
  //   const mockLog = jest.fn();
  //
  //   const logger = createLogger(mockLog);
  //
  //   const worker = createWorker(
  //     logger,
  //     () =>
  //       new BluebirdPromise((resolve) => {
  //         sleep(jobTimeSec * 1000).then(() => {
  //           resolve(testResult);
  //         });
  //       }),
  //     timeoutSec
  //   );
  //
  //   try {
  //     await worker["executeWithDeadline"]({});
  //   } catch (error: any) {
  //     expect(error.message).toBe(
  //       `Execution timeout of ${timeoutSec} seconds exceeded`
  //     );
  //   }
  //
  //   // // one "Execution timeout exceeded" log
  //   expect(mockLog.mock.calls.length).toBe(1);
  //   expect(mockLog.mock.calls[0][0]).toBe("Execution timeout exceeded");
  //
  //   // wait to exit tests without running processes
  //   await sleep(2 * 1000);
  // });
  //
  // test("job fails", async () => {
  //   const jobTimeSec = 1;
  //   const timeoutSec = 3;
  //   const testErrorMsg = "job failed with some error";
  //
  //   const mockLog = jest.fn();
  //
  //   const logger = createLogger(mockLog);
  //
  //   const worker = createWorker(
  //     logger,
  //     () =>
  //       new BluebirdPromise((_, reject) => {
  //         sleep(jobTimeSec * 1000).then(() => {
  //           reject(Error(testErrorMsg));
  //         });
  //       }),
  //     timeoutSec
  //   );
  //
  //   try {
  //     await worker["executeWithDeadline"]({});
  //   } catch (error: any) {
  //     expect(error.message).toBe(testErrorMsg);
  //   }
  //
  //   expect(mockLog.mock.calls.length).toBe(0);
  //
  //   await sleep(2 * 1000);
  // });

  test("job cancellation if timeout happens", async () => {
    const jobTimeSec = 3;
    const timeoutSec = 1;

    const mockFn = jest.fn();

    const logger = createLogger(() => {});
    const worker = createWorker(
      logger,
      () =>
        new BluebirdPromise(async (resolve) => {
          await sleep(jobTimeSec * 1000);

          console.log("sleep finished");
          console.log(new Date());

          mockFn();
          resolve();
        }),
      timeoutSec
    );

    try {
      await worker["executeWithDeadline"]({});
    } catch (error: any) {
      // ignored
    }

    // wait for job to finish (if not canceled properly)
    await sleep(4 * 1000);

    // should not be called if canceled
    expect(mockFn.mock.calls.length).toBe(0);
  });
});
