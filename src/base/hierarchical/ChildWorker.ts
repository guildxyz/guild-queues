import {
  BaseChildJob,
  BaseChildQueueName,
  ChildGroupAllCountKey,
  ChildGroupDoneCountKey,
  ChildGroupNextQueueKey,
  ChildJobKey,
  ChildResultKey,
} from "./types";
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
    const childKey: ChildJobKey<ChildQueueName> = `child:${this.queue.name}:job:${childId}`;

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
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;

    const childJobGroupName = this.queue.name.split(":")[0];

    const childResultKey: ChildResultKey<ChildQueueName> = `child:${this.queue.name}:result:${childId}`;
    const childJobDoneCountKey: ChildGroupDoneCountKey = `child-group:${childJobGroupName}:count:done`;
    const childJobAllCountKey: ChildGroupAllCountKey = `child-group:${childJobGroupName}:count:all`;
    const childJobNextQueueKey: ChildGroupNextQueueKey = `child-group:${childJobGroupName}:next-queue`;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // save result
    if (result) {
      transaction.hSet(flowKey, childResultKey, JSON.stringify(result));
    }

    // increment child group done count by 1
    transaction.hIncrBy(flowKey, childJobDoneCountKey, 1);

    // get the child group count
    transaction.hGet(flowKey, childJobAllCountKey);

    // get the next queue
    transaction.hGet(flowKey, childJobNextQueueKey);

    // remove job from the current queue
    transaction.lRem(this.queue.processingQueueKey, 1, jobId);

    // remove the lock
    transaction.del(itemLockKey);

    // execute the transaction
    const transactionResult = await transaction.exec();

    this.logger?.info("ChildWorker completed a job", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      jobId,
      transactionResult,
    });

    // get the results (I count from the end because the first HSET is optional)
    const incrementResult = transactionResult[transactionResult.length - 5];
    const childCount = transactionResult[transactionResult.length - 4];
    const nextQueue = transactionResult[transactionResult.length - 3];

    // check if it was the last job in the child group
    if (incrementResult === +childCount) {
      // if yes and there's a next queue, put the job to the next queue
      if (nextQueue) {
        const nextQueueKey = `${Queue.keyPrefix}:${nextQueue}:waiting`;
        await this.nonBlockingRedis.rPush(nextQueueKey, parentId);
      }

      // and mark the child-group done
      await this.nonBlockingRedis.hSet(
        flowKey,
        "status",
        `${childJobGroupName} done`
      );
    }
    return false;
  }
}
