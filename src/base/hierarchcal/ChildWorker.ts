import { BaseChildJob } from "./types";
import Worker from "../Worker";

export default class ChildWorker<
  Job extends BaseChildJob,
  Result
> extends Worker<Job, Result> {
  protected override async lease(timeout: number): Promise<Job> {
    const jobId: string = await this.blockingRedis.blMove(
      this.queue.waitingQueueKey,
      this.queue.processingQueueKey,
      "LEFT",
      "RIGHT",
      timeout
    );

    const [parentId, childId] = jobId.split(":");
    const childKey = `child:${this.queue.name}:${childId}`;

    // set a lock for the job with expiration
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;
    await this.nonBlockingRedis.set(itemLockKey, this.id, {
      EX: this.lockTime,
    });

    // get the flow's state attributes
    const flowKey = `flow:${parentId}`;
    const childJobString = await this.nonBlockingRedis.hGet(flowKey, childKey);
    if (!childJobString) {
      this.logger?.warn("Child property not found", { flowKey, childKey });
      throw new Error(`Child property not found (${flowKey},${childKey})`);
    }
    const childJob = JSON.parse(childJobString);

    // return job with flowId
    return { parentId, childId, ...childJob };
  }

  protected async complete(jobId: string, result?: Result): Promise<boolean> {
    const [parentId, childId] = jobId.split(":");
    const flowKey = `flow:${parentId}`;
    const childKey = `child:${this.queue.name}:${childId}`;
    const itemLockKey = `${this.queue.lockPrefixKey}:${jobId}`;

    // start a redis transaction
    const transaction = this.nonBlockingRedis.multi();

    // save result
    transaction.hSet(flowKey, childKey, JSON.stringify(result));

    // increment childDoneCount by 1
    transaction.hIncrBy(flowKey, "childDoneCount", 1);

    // remove job from the current queue
    transaction.lRem(this.queue.processingQueueKey, 1, jobId).del(itemLockKey);

    // remove the lock
    transaction.del(itemLockKey);

    await transaction.exec();

    return false;
  }
}
