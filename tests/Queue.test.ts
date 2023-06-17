import Queue from "../src/base/Queue";
import { QueueOptions } from "../src/base/types";
import { LOCK_KEY_PREFIX, QUEUE_KEY_PREFIX } from "../src/static";

const TEST_QUEUE_NAME = "testQueue";
const TEST_ATTRIBUTES_TO_GET = ["asd", "qwe"];
const TEST_NEXT_QUEUE_NAME = "testNextQueue";
const TEST_CHILD_QUEUE_NAME = "testQueue";
const TEST_CHILD_ATTRIBUTES_TO_GET = ["rty"];

describe("Check Queue", () => {
  test("Check constructor", () => {
    const queueOptions: QueueOptions = {
      queueName: TEST_QUEUE_NAME as any,
      nextQueueName: TEST_NEXT_QUEUE_NAME as any,
      attributesToGet: TEST_ATTRIBUTES_TO_GET,
      children: [
        {
          queueName: TEST_CHILD_QUEUE_NAME,
          attributesToGet: TEST_CHILD_ATTRIBUTES_TO_GET,
        },
      ],
    };

    const queue = new Queue(queueOptions);

    expect(queue.name).toBe(TEST_QUEUE_NAME);
    expect(queue.attributesToGet).toBe(TEST_ATTRIBUTES_TO_GET);
    expect(queue.nextQueueKey).toBe(
      `${QUEUE_KEY_PREFIX}:${TEST_NEXT_QUEUE_NAME}:waiting`
    );
    expect(queue.waitingQueueKey).toBe(
      `${QUEUE_KEY_PREFIX}:${TEST_QUEUE_NAME}:waiting`
    );
    expect(queue.processingQueueKey).toBe(
      `${QUEUE_KEY_PREFIX}:${TEST_QUEUE_NAME}:processing`
    );
    expect(queue.lockKeyPrefix).toBe(`${LOCK_KEY_PREFIX}:${TEST_QUEUE_NAME}`);

    expect(queue.children.length).toBe(1);
    expect(queue.children[0].name).toBe(
      `${TEST_QUEUE_NAME}:${TEST_CHILD_QUEUE_NAME}`
    );
    expect(queue.children[0].attributesToGet).toBe(
      TEST_CHILD_ATTRIBUTES_TO_GET
    );
    expect(queue.children[0].nextQueueKey).toBe(undefined);
    expect(queue.children[0].waitingQueueKey).toBe(
      `${QUEUE_KEY_PREFIX}:${TEST_QUEUE_NAME}:${TEST_CHILD_QUEUE_NAME}:waiting`
    );
    expect(queue.children[0].processingQueueKey).toBe(
      `${QUEUE_KEY_PREFIX}:${TEST_QUEUE_NAME}:${TEST_CHILD_QUEUE_NAME}:processing`
    );
    expect(queue.children[0].lockKeyPrefix).toBe(
      `${LOCK_KEY_PREFIX}:${TEST_QUEUE_NAME}:${TEST_CHILD_QUEUE_NAME}`
    );
    expect(queue.children[0].children.length).toBe(0);
  });
});
