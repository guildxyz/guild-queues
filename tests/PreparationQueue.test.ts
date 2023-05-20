/* eslint-disable dot-notation */
import AccessFlow from "../src/classes/AccessFlow";
import {
  REDIS_CLIENT,
  TEST_FLOW_OPTIONS,
  TEST_ACCESS_FLOW_OPTIONS,
} from "./common";

export const TEST_USER_ID = 999;
export const TEST_ROLE_IDS = [123, 456, 789];

let accessFlow: AccessFlow;

beforeAll(async () => {
  await REDIS_CLIENT.connect();

  accessFlow = new AccessFlow(TEST_ACCESS_FLOW_OPTIONS);
  await accessFlow.connect();
});

beforeEach(async () => {
  await REDIS_CLIENT.flushDb();
});

afterAll(async () => {
  await accessFlow.disconnect();

  await REDIS_CLIENT.flushDb();
  await REDIS_CLIENT.disconnect();
});

describe("Check preparation queue", () => {
  test("Check lease (depends on createFlow)", async () => {
    // setup
    const flowId = await accessFlow.createFlow(TEST_FLOW_OPTIONS);
    const worker = accessFlow.getPreparationWorker(async () => ({
      nextQueue: "access-check",
    }));
    await worker.connect();

    // call lease
    const preparationJob = await worker["lease"](10);

    // check return value
    expect(preparationJob.flowId).toBe(flowId);
    expect(preparationJob.userId).toBe(TEST_FLOW_OPTIONS.userId);
    expect(preparationJob.roleIds).toStrictEqual(TEST_FLOW_OPTIONS.roleIds);
    expect(preparationJob.recheckAccess).toBe(TEST_FLOW_OPTIONS.recheckAccess);

    // check queues
    const waitingQueueItems = await REDIS_CLIENT.lRange(
      worker.queue.waitingQueueKey,
      0,
      -1
    );
    expect(waitingQueueItems.length).toBe(0);

    const processingQueueItems = await REDIS_CLIENT.lRange(
      worker.queue.processingQueueKey,
      0,
      -1
    );
    expect(processingQueueItems.length).toBe(1);
    expect(processingQueueItems[0]).toBe(flowId);

    // cleanup
    await worker.disconnect();
  });

  test("Check complete (depends on createFlow and lease)", async () => {
    // setup
    const flowId = await accessFlow.createFlow(TEST_FLOW_OPTIONS);
    const worker = accessFlow.getPreparationWorker(async () => ({
      nextQueue: "access-check",
    }));
    await worker.connect();
    const preparationJob = await worker["lease"](10);

    // call complete
    const success = await worker["complete"](preparationJob.flowId, {
      nextQueue: "access-check",
    });

    // check return value
    expect(success).toBe(true);

    // check state
    const flow = await REDIS_CLIENT.hGetAll(`flow:${flowId}`);
    expect(flow).toBeTruthy();
    expect(flow.userId).toBe("999"); // make sure previous values not deleted

    // check queues
    const processingQueueItems = await REDIS_CLIENT.lRange(
      worker.queue.processingQueueKey,
      0,
      -1
    );
    expect(processingQueueItems.length).toBe(0);

    const nextQueueItems = await REDIS_CLIENT.lRange(
      `queue:access-check:waiting`,
      0,
      -1
    );
    expect(nextQueueItems.length).toBe(1);
    expect(nextQueueItems[0]).toBe(flowId);

    // cleanup
    await worker.disconnect();
  });
});
