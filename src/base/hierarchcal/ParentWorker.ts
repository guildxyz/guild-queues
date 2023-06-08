import { v4 as uuidV4 } from "uuid";
import Queue from "../Queue";
import PrimaryWorker from "../primary/PrimaryWorker";
import { BaseJob } from "../types";
import {
  BaseChildJobParams,
  FormattedParentResult,
  ParentResult,
} from "./types";

export default class ParentWorker<
  QueueName extends string,
  Job extends BaseJob,
  ChildJobParam extends BaseChildJobParams,
  Result extends ParentResult<QueueName, ChildJobParam>
> extends PrimaryWorker<QueueName, Job, Result> {
  protected override async complete(
    flowId: string,
    result?: Result
  ): Promise<boolean> {
    const transaction = this.nonBlockingRedis.multi();

    const newResult: FormattedParentResult<QueueName, ChildJobParam> = result;
    result.children.forEach((childJob) => {
      const parentId = flowId;
      const childId = uuidV4();
      const childJobId = `${parentId}:${childId}`;
      newResult[`child:job:${childJob.subQueueName}:${childId}`] = {
        ...childJob,
        parentId,
        id: childJobId,
      };
      transaction.rPush(
        `${Queue.keyPrefix}:${childJob.subQueueName}:waiting`,
        childJobId
      );

      this.logger?.info("ParentWorker preparing child job", {
        queueName: this.queue.name,
        flowPredix: this.flowPrefix,
        workerId: this.id,
        childJobId,
      });
    });

    await transaction.exec();
    this.logger?.info("ParentWorker created child jobs", {
      queueName: this.queue.name,
      flowPredix: this.flowPrefix,
      workerId: this.id,
      childJobCount: result.children.length,
    });

    // there is a small chance here that the worker dies here
    // and the manage-reward jobs will be repeated
    // but in my opinion it's batter than complicating the code here

    newResult.childCount = newResult.children.length;
    newResult.childDoneCount = 0;
    delete newResult.children;
    return super.complete(flowId, result);
  }
}
