import {
  REDIS_CLIENT,
  TEST_FLOW_OPTIONS,
  TestFlowCreateOptions,
  TestFlowLookupAttributes,
  TestJob1,
  TestJob1Params,
  TestJob1Result,
} from "./common";
import Flow from "../src/base/Flow";
import { WorkerFunction } from "../src/base/types";

let flow: Flow<TestJob1, TestFlowCreateOptions, TestFlowLookupAttributes>;

beforeAll(async () => {
  await REDIS_CLIENT.connect();

  flow = new Flow<TestJob1, TestFlowCreateOptions, TestFlowLookupAttributes>(
    TEST_FLOW_OPTIONS
  );
});

beforeEach(async () => {
  await REDIS_CLIENT.flushDb();
});

afterAll(async () => {
  await REDIS_CLIENT.flushDb();
  await REDIS_CLIENT.disconnect();
});

describe("Check Worker", () => {
  test("", () => {
    const testWorkerFunction: WorkerFunction<
      TestJob1Params,
      TestJob1Result
    > = async (job) => ({ access: job.guildId === 1 });

    flow.createWorker("test1", testWorkerFunction);
    //   __          _______ _____
    //   \ \        / /_   _|  __ \
    //    \ \  /\  / /  | | | |__) |
    //     \ \/  \/ /   | | |  ___/
    //      \  /\  /   _| |_| |
    //       \/  \/   |_____|_|
  });
});
