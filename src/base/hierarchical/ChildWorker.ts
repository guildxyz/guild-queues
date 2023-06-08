import { BaseChildJob, BaseChildQueueName } from "./types";
import Worker from "../Worker";
import Queue from "../Queue";

/**
 * Worker for child jobs
 */
export default class ChildWorker<
  ChildQueueName extends BaseChildQueueName,
  Job extends BaseChildJob<ChildQueueName>,
  Result
> extends Worker<ChildQueueName, Job, Result> {
  /**
   * Fetches a child job from the parent's hash, locks is for execution, and returns it
   * @param timeout maximum number of seconds to block (zero means block indefinitely)
   * @returns the child job
   */
  protected override async lease(timeout: number): Promise<Job> {
    const jobId: string = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    const [parentId, childId] = jobId.split(":");
    const childKey = `child:job:${this.queue.name}:${childId}`;

    // set a lock for the job with expiration
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTime,
    });

    // get the flow's state attributes
    const flowKey = `${this.flowPrefix}:${parentId}`;
    const childJobString = await this.nonBlockingRedis.hGet(flowKey, childKey);
    if (!childJobString) {
      const errorMessage = "Child property not found";
      this.logger?.warn(errorMessage, { flowKey, childKey });
      throw new Error(`${errorMessage} (${flowKey},${childKey})`);
    }
    const childJob = JSON.parse(childJobString);

    this.logger?.info("ChildWorker leased job", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      jobId,
    });

    // return job with flowId
    return { parentId, childId, ...childJob };
  }

  /**
   * Saves a child job's result to the parent's hash and increments the child job counter
   * @param jobId the job's id
   * @param result the result of the job
   * @returns whether it was successful
   */
  protected async complete(jobId: string, result?: Result): Promise<boolean> {
    const [parentId, childId] = jobId.split(":");
    const flowKey = `${this.flowPrefix}:${parentId}`;
    const childResultKey = `child:result:${this.queue.name}:${childId}`;
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // save result
    if (result) {
      transaction.hSet(flowKey, childResultKey, JSON.stringify(result));
    }

    // increment childDoneCount by 1
    transaction.hIncrBy(flowKey, "childDoneCount", 1);

    // get the child count
    transaction.hGet(flowKey, "childCount");

    // remove job from the current queue
    transaction.lRem(this.queue.processingQueueKey, 1, jobId);

    // remove the lock
    transaction.del(itemLockKey);

    const transactionResult = await transaction.exec();

    this.logger?.info("ChildWorker completed a job", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      jobId,
      transactionResult,
    });

    const incrementResult = transactionResult[transactionResult.length - 4];
    const childCount = transactionResult[transactionResult.length - 3];

    if (incrementResult === +childCount) {
      const nextQueue = await this.nonBlockingRedis.hGet(flowKey, "nextQueue");
      if (nextQueue) {
        const nextQueueKey = `${Queue.keyPrefix}:${nextQueue}:waiting`;
        await this.nonBlockingRedis.rPush(nextQueueKey, parentId);
      }

      const childJobGroupName = this.queue.name.split(":")[0];
      await this.nonBlockingRedis.hSet(
        flowKey,
        "status",
        `${childJobGroupName} done`
      );
    }
    return false;
  }
}
