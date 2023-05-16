import QueueFactory from "../src/QueueFactory";
import { REDIS_CLIENT, TEST_FLOW_OPTIONS, TEST_OPTIONS } from "./common";

export const TEST_USER_ID = 999;
export const TEST_ROLE_IDS = [123, 456, 789];

beforeAll(async () => {
  await REDIS_CLIENT.connect();
});

beforeEach(async () => {
  await REDIS_CLIENT.flushDb();
});

afterAll(async () => {
  await REDIS_CLIENT.flushDb();
  await REDIS_CLIENT.disconnect();
});

describe("Check preparation queue", () => {
  test("Check lease (depends on createFlow)", async () => {
    // setup
    const qf = new QueueFactory(TEST_OPTIONS);
    const flowId = await qf.createFlow(TEST_FLOW_OPTIONS);
    const queue = qf.getPreparationQueue();

    // call lease
    const preparationJob = await queue.lease();

    // check return value
    expect(preparationJob.flowId).toBe(flowId);
    expect(preparationJob.userId).toBe(TEST_FLOW_OPTIONS.userId);
    expect(preparationJob.roleIds).toStrictEqual(TEST_FLOW_OPTIONS.roleIds);
    expect(preparationJob.recheckAccess).toBe(TEST_FLOW_OPTIONS.recheckAccess);

    // check queues
    const waitingQueueItems = await REDIS_CLIENT.lRange(
      queue.waitingQueueKey,
      0,
      -1
    );
    expect(waitingQueueItems.length).toBe(0);

    const processingQueueItems = await REDIS_CLIENT.lRange(
      queue.processingQueueKey,
      0,
      -1
    );
    expect(processingQueueItems.length).toBe(1);
    expect(processingQueueItems[0]).toBe(flowId);
  });

  test("Check complete (depends on createFlow and lease)", async () => {
    // setup
    const qf = new QueueFactory(TEST_OPTIONS);
    const flowId = await qf.createFlow(TEST_FLOW_OPTIONS);
    const queue = qf.getPreparationQueue();
    const preparationJob = await queue.lease();

    // call complete
    const success = await queue.complete(
      preparationJob.flowId,
      undefined,
      "access-check"
    );

    // check return value
    expect(success).toBe(true);

    // check state
    const flow = await REDIS_CLIENT.hGetAll(`flow:${flowId}`);
    expect(flow).toBeTruthy();
    expect(flow.userId).toBe("999"); // make sure previous values not deleted

    // check queues
    const processingQueueItems = await REDIS_CLIENT.lRange(
      queue.processingQueueKey,
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
  });
});
