import { v4 as uuidV4 } from "uuid";
import Queue from "../Queue";
import PrimaryWorker from "../primary/PrimaryWorker";
import { BaseJob } from "../types";
import {
  BaseChildJobParams,
  BaseChildQueueName,
  FormattedParentResult,
  ParentResult,
} from "./types";

/**
 * Modified PrimaryWorker which creates child jobs instead of passing a job to a next queue
 */
export default class ParentWorker<
  QueueName extends string,
  ChildQueueName extends BaseChildQueueName,
  Job extends BaseJob,
  ChildJobParam extends BaseChildJobParams<ChildQueueName>,
  Result extends ParentResult<QueueName, ChildQueueName, ChildJobParam>
> extends PrimaryWorker<QueueName, Job, Result> {
  /**
   * Create child jobs then call ParentWorker.complete()
   */
  protected override async complete(
    flowId: string,
    result?: Result
  ): Promise<boolean> {
    const transaction = this.nonBlockingRedis.multi();

    // map children into attributes
    const newResult: FormattedParentResult<
      QueueName,
      ChildQueueName,
      ChildJobParam
    > = result;
    result.children.forEach((childJob) => {
      // the current flowId will be referred as the parentId in the child worker
      const parentId = flowId;
      // generate a unique id for the child job
      const childId = uuidV4();
      const childJobId = `${parentId}:${childId}`;

      // add new property to result which represents a single child job
      newResult[`child:${childJob.childQueueName}:job:${childId}`] = {
        ...childJob,
        parentId,
        id: childJobId,
      };

      // add child job id to the child queue
      transaction.rPush(
        `${Queue.keyPrefix}:${childJob.childQueueName}:waiting`,
        childJobId
      );

      this.logger?.info("ParentWorker preparing child job", {
        queueName: this.queue.name,
        flowPredix: this.flowPrefix,
        workerId: this.id,
        childJobId,
      });
    });

    this.logger?.info("ParentWorker created child jobs", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      childJobCount: result.children.length,
    });

    const childJobGroupName =
      result.children?.[0]?.childQueueName?.split(":")[0];

    newResult[`child-group:${childJobGroupName}:count:all`] =
      newResult.children.length;
    newResult[`child-group:${childJobGroupName}:count:done`] = 0;

    if (result.nextQueue) {
      newResult[`child-group:${childJobGroupName}:next-queue`] =
        result.nextQueue;
    }

    // remove children, because we save them as separate keys
    delete newResult.children;
    // remove nextQueue because the PrimaryWorker.complete should not start the next job immediately
    // it will be started once each of the child job is complete
    delete newResult.nextQueue;

    // there is a small chance here that the worker dies here
    // and the manage-reward jobs will be repeated
    // but in my opinion it's batter than complicating the code here

    // call PrimaryWorker.complete
    await super.complete(flowId, result);

    await transaction.exec();

    return true;
  }
}
