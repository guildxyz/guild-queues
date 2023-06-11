/* eslint-disable no-await-in-loop */
import { hGetMore, hSetMore } from "../../utils";
import Worker from "../Worker";
import { AnyObject, BaseJob, PrimaryResult } from "../types";
import Queue from "../Queue";

/**
 * Worker for the flow's main queues
 */
export default class PrimaryWorker<
  QueueName extends string,
  Job extends BaseJob,
  Result extends PrimaryResult<QueueName>
> extends Worker<QueueName, Job, Result> {
  /**
   * Lock a job for execution and return it
   * @param timeout maximum number of seconds to block (zero means block indefinitely)
   * @returns the job
   */
  protected async lease(timeout: number): Promise<Job> {
    // move a job from the waiting queue to the processing queue
    const jobId: string = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    // set a lock for the job with expiration
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTime,
    });

    // get the flow's state attributes
    const flowKey = `${this.flowPrefix}:${jobId}`;
    const attributes = await hGetMore(
      this.nonBlockingRedis,
      flowKey,
      this.queue.attributesToGet
    );

    this.logger?.info("Primary worker leased job", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      jobId,
    });

    // return job with flowId
    return { id: jobId, ...attributes } as Job;
  }

  /**
   * Updates the flow's status, removed the specified job from the queue and adds it to the next one
   * @param jobId the job's id
   * @param result the result of the job
   * @returns whether it was successful
   */
  protected async complete(jobId: string, result?: Result): Promise<boolean> {
    const flowKey = `${this.flowPrefix}:${jobId}`;
    const { nextQueue } = result;

    const propertiesToSave: AnyObject = result;
    delete propertiesToSave.nextQueue;
    propertiesToSave["completed-queue"] = this.queue.name;

    // save the result
    await hSetMore(this.nonBlockingRedis, flowKey, propertiesToSave);

    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    const nextQueueKey = nextQueue
      ? `${Queue.keyPrefix}:${nextQueue}:waiting`
      : this.queue.nextQueueKey;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // put job to next queue (if there's a next queue)
    if (nextQueueKey) {
      transaction.rPush(nextQueueKey, jobId);
    }

    // remove it from the current one
    transaction.lRem(this.queue.processingQueueKey, 1, jobId).del(itemLockKey);

    const [_, removedItemCount, removedLockCount] = await transaction.exec();

    // check if the job was remove successfully from the current queue
    if (+removedItemCount > 0) {
      this.logger?.info("PrimaryWorker completed a job", {
        queueName: this.queue.name,
        flowPredix: this.flowPrefix,
        workerId: this.id,
        removedLockCount,
      });
      return true;
    }

    // else: the item was not present in the current queue (inconsistency)
    // try to abort it: remove from the next queue (if there's a next queue)
    let abortSuccessful: boolean;
    if (nextQueueKey) {
      const abortResult = await this.nonBlockingRedis.lRem(
        this.queue.nextQueueKey,
        -1,
        jobId
      );
      abortSuccessful = abortResult === 1;
    }

    this.logger?.warn(
      `inconsistency in complete(), item not found in processing queue`,
      {
        name: this.queue.name,
        processingQueueKey: this.queue.processingQueueKey,
        jobId,
        abortSuccessful,
      }
    );

    return false;
  }
}
