import AccessFlow from "../src/classes/AccessFlow";
import {
  REDIS_CLIENT,
  TEST_FLOW_OPTIONS,
  TEST_ACCESS_FLOW_OPTIONS,
} from "./common";

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

describe("Check AccessFlow", () => {
  test("Check createFlow", async () => {
    // setup
    const af = new AccessFlow(TEST_ACCESS_FLOW_OPTIONS);
    await af.connect();

    // call createFlow
    const flowId = await af.createFlow(TEST_FLOW_OPTIONS);

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
    const { preparationQueue } = af;
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

    // cleanup
    await af.disconnect();
  });
});
