import { createClient } from "redis";
import { QueueClientOptions } from "../src/types";
import QueueClient from "../src/QueueClient";

const REDIS_CLIENT = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  database: 15,
});

const TEST_OPTIONS: QueueClientOptions = {
  queueName: "testQueue",
  redisClient: REDIS_CLIENT,
  keyPrefix: "test",
  nextQueueName: "nextTestQueue",
};

const WAITING_QUEUE_KEY = "test:testQueue:waiting";
const PROCESSING_QUEUE_KEY = "test:testQueue:processing";
const NEXT_QUEUE_KEY = "test:nextTestQueue:waiting";

type TestItem = { id: string; num: number };
const ITEM1: TestItem = { id: "a", num: 123 };
const ITEM2: TestItem = { id: "b", num: 456 };
const ITEM3: TestItem = { id: "c", num: 789 };
type ResultItem = { id: string; res: number };
const RESULT1: ResultItem = { id: "a", res: 84622 };
const RESULT2: ResultItem = { id: "b", res: 19573 };
const RESULT3: ResultItem = { id: "c", res: 48324 };

beforeAll(async () => {
  await REDIS_CLIENT.connect();
  await REDIS_CLIENT.flushDb();
});

afterAll(async () => {
  await REDIS_CLIENT.flushDb();
  await REDIS_CLIENT.disconnect();
});

describe("Check QueueClient", () => {
  test("Check add", async () => {
    const qc = new QueueClient<TestItem>(TEST_OPTIONS);

    await qc.add(ITEM1);
    await qc.add(ITEM2);
    await qc.add(ITEM3);

    const itemInList = await REDIS_CLIENT.lRange(WAITING_QUEUE_KEY, 0, -1);

    expect(itemInList.length).toBe(3);
    expect(JSON.parse(itemInList[0])).toStrictEqual(ITEM1);
    expect(JSON.parse(itemInList[1])).toStrictEqual(ITEM2);
    expect(JSON.parse(itemInList[2])).toStrictEqual(ITEM3);

    await REDIS_CLIENT.flushDb();
  });

  test("Check addBulk", async () => {
    const qc = new QueueClient<TestItem>(TEST_OPTIONS);

    await qc.addBulk([ITEM1, ITEM2, ITEM3]);

    const itemsInList = await REDIS_CLIENT.lRange(WAITING_QUEUE_KEY, 0, -1);

    expect(itemsInList.length).toBe(3);
    expect(JSON.parse(itemsInList[0])).toStrictEqual(ITEM1);
    expect(JSON.parse(itemsInList[1])).toStrictEqual(ITEM2);
    expect(JSON.parse(itemsInList[2])).toStrictEqual(ITEM3);

    await REDIS_CLIENT.flushDb();
  });

  test("Check addBulk", async () => {
    const qc = new QueueClient<TestItem>(TEST_OPTIONS);

    await qc.addBulk([ITEM1, ITEM2, ITEM3]);

    const itemsInList = await REDIS_CLIENT.lRange(WAITING_QUEUE_KEY, 0, -1);

    expect(itemsInList.length).toBe(3);
    expect(JSON.parse(itemsInList[0])).toStrictEqual(ITEM1);
    expect(JSON.parse(itemsInList[1])).toStrictEqual(ITEM2);
    expect(JSON.parse(itemsInList[2])).toStrictEqual(ITEM3);

    await REDIS_CLIENT.flushDb();
  });

  test("Check lease (depends on addBulk)", async () => {
    const qc = new QueueClient<TestItem>(TEST_OPTIONS);

    await qc.addBulk([ITEM1, ITEM2, ITEM3]);

    // first lease //

    const firstItem = await qc.lease();
    expect(firstItem).toStrictEqual(ITEM1);

    const itemsInWaitingList = await REDIS_CLIENT.lRange(
      WAITING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInWaitingList.length).toBe(2);
    expect(JSON.parse(itemsInWaitingList[0])).toStrictEqual(ITEM2);
    expect(JSON.parse(itemsInWaitingList[1])).toStrictEqual(ITEM3);

    const itemsInProgressingList = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressingList.length).toBe(1);
    expect(JSON.parse(itemsInProgressingList[0])).toStrictEqual(ITEM1);

    // second lease //

    const secondItem = await qc.lease();
    expect(secondItem).toStrictEqual(ITEM2);

    const itemsInWaitingList2 = await REDIS_CLIENT.lRange(
      WAITING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInWaitingList2.length).toBe(1);
    expect(JSON.parse(itemsInWaitingList2[0])).toStrictEqual(ITEM3);

    const itemsInProgressingList2 = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressingList2.length).toBe(2);
    expect(JSON.parse(itemsInProgressingList2[0])).toStrictEqual(ITEM1);
    expect(JSON.parse(itemsInProgressingList2[1])).toStrictEqual(ITEM2);

    // third lease //

    const thirdItem = await qc.lease();
    expect(thirdItem).toStrictEqual(ITEM3);

    const itemsInWaitingList3 = await REDIS_CLIENT.lRange(
      WAITING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInWaitingList3.length).toBe(0);

    const itemsInProgressingList3 = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressingList3.length).toBe(3);
    expect(JSON.parse(itemsInProgressingList3[0])).toStrictEqual(ITEM1);
    expect(JSON.parse(itemsInProgressingList3[1])).toStrictEqual(ITEM2);
    expect(JSON.parse(itemsInProgressingList3[2])).toStrictEqual(ITEM3);

    await REDIS_CLIENT.flushDb();
  });

  test("Check complete (depends on addBulk and lease)", async () => {
    const qc = new QueueClient<TestItem, ResultItem>(TEST_OPTIONS);

    await qc.addBulk([ITEM1, ITEM2]);

    await qc.lease();
    await qc.lease();

    // first complete //

    const result1 = await qc.complete(ITEM1, RESULT1);

    expect(result1).toBe(true);

    const itemsInProgressing = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressing.length).toBe(1);
    expect(JSON.parse(itemsInProgressing[0])).toStrictEqual(ITEM2);

    const itemsInNextList = await REDIS_CLIENT.lRange(NEXT_QUEUE_KEY, 0, -1);
    expect(itemsInNextList.length).toBe(1);
    expect(JSON.parse(itemsInNextList[0])).toStrictEqual(RESULT1);

    // second complete //

    const result2 = await qc.complete(ITEM2, RESULT2);

    expect(result2).toBe(true);

    const itemsInProgressing2 = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressing2.length).toBe(0);

    const itemsInNextList2 = await REDIS_CLIENT.lRange(NEXT_QUEUE_KEY, 0, -1);
    expect(itemsInNextList2.length).toBe(2);
    expect(JSON.parse(itemsInNextList2[0])).toStrictEqual(RESULT1);
    expect(JSON.parse(itemsInNextList2[1])).toStrictEqual(RESULT2);

    // third complete //

    const result3 = await qc.complete(ITEM3, RESULT3);

    expect(result3).toBe(false);

    await REDIS_CLIENT.flushDb();
  });

  test("Check remove (depends on addBulk and lease)", async () => {
    const qc = new QueueClient<TestItem, ResultItem>(TEST_OPTIONS);

    await qc.addBulk([ITEM1, ITEM2]);

    await qc.lease();
    await qc.lease();

    // first remove //

    const result1 = await qc.remove(ITEM1);

    expect(result1).toBe(true);

    const itemsInProgressing = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressing.length).toBe(1);
    expect(JSON.parse(itemsInProgressing[0])).toStrictEqual(ITEM2);

    const itemsInNextList = await REDIS_CLIENT.lRange(NEXT_QUEUE_KEY, 0, -1);
    expect(itemsInNextList.length).toBe(0);

    // second remove //

    const result2 = await qc.remove(ITEM2);

    expect(result2).toBe(true);

    const itemsInProgressing2 = await REDIS_CLIENT.lRange(
      PROCESSING_QUEUE_KEY,
      0,
      -1
    );
    expect(itemsInProgressing2.length).toBe(0);

    const itemsInNextList2 = await REDIS_CLIENT.lRange(NEXT_QUEUE_KEY, 0, -1);
    expect(itemsInNextList2.length).toBe(0);

    // third complete //

    const result3 = await qc.remove(ITEM3);

    expect(result3).toBe(false);

    await REDIS_CLIENT.flushDb();
  });
});
