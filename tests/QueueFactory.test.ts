import QueueFactory from "../src/QueueFactory";
import { REDIS_CLIENT, TEST_FLOW_OPTIONS, TEST_OPTIONS } from "./common";

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

describe("Check QueueFactory", () => {
  test("Check createFlow", async () => {
    // setup
    const qf = new QueueFactory(TEST_OPTIONS);

    // call createFlow
    const flowId = await qf.createFlow(TEST_FLOW_OPTIONS);

    // check flow
    const flow = await REDIS_CLIENT.hGetAll(`flow:${flowId}`);

    expect(flow).toBeTruthy();
    expect(flow.userId).toBe("999");
    expect(flow.roleIds).toBe("123,456,789");
    expect(flow.recheckAccess).toBe("true");
    expect(flow.updateMemberships).toBe("true");
    expect(flow.manageRewards).toBe("true");
    expect(flow.forceRewardActions).toBe("false");
    expect(flow.priority).toBe("1");

    // check queues
    const preparationQueue = qf.getPreparationQueue();
    const waitingQueueItems = await REDIS_CLIENT.lRange(
      preparationQueue.waitingQueueKey,
      0,
      -1
    );
    expect(waitingQueueItems.length).toBe(1);
    expect(waitingQueueItems[0]).toBe(flowId);

    const processingQueueItems = await REDIS_CLIENT.lRange(
      preparationQueue.processingQueueKey,
      0,
      -1
    );
    expect(processingQueueItems.length).toBe(0);
  });
});
