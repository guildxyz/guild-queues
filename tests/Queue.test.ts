import Queue from "../src/classes/Queue";
import { QueueOptions } from "../src/types";

const TEST_QUEUE_NAME = "testQueue";
const TEST_ATTRIBUTES_TO_GET = ["asd", "qwe"];
const TEST_NEXT_QUEUE_NAME = "testNextQueue";

describe("Check Queue", () => {
  test("Check constructor", () => {
    const queueOptions: QueueOptions = {
      queueName: TEST_QUEUE_NAME as any,
      nextQueueName: TEST_NEXT_QUEUE_NAME as any,
      attributesToGet: TEST_ATTRIBUTES_TO_GET,
    };

    const queue = new Queue(queueOptions);

    expect(queue.name).toBe(TEST_QUEUE_NAME);
    expect(queue.attributesToGet).toBe(TEST_ATTRIBUTES_TO_GET);
    expect(queue.nextQueueKey).toBe(
      `${Queue.keyPrefix}:${TEST_NEXT_QUEUE_NAME}:waiting`
    );
    expect(queue.waitingQueueKey).toBe(
      `${Queue.keyPrefix}:${TEST_QUEUE_NAME}:waiting`
    );
    expect(queue.processingQueueKey).toBe(
      `${Queue.keyPrefix}:${TEST_QUEUE_NAME}:processing`
    );
    expect(queue.lockPrefixKey).toBe(
      `${Queue.keyPrefix}:${TEST_QUEUE_NAME}:lock`
    );
  });
});
