import { v4 as uuidV4 } from "uuid";
import Queue from "./Queue";
import {
  AccessCheckJob,
  AccessCheckResult,
  PreparationJob,
  FlowOptions,
  FlowId,
} from "./types";
import QueueBaseClient from "./QueueBaseClient";

/**
 * Class to instantiate queues and create flows
 */
export default class QueueFactory extends QueueBaseClient {
  /**
   * Create an access flow and start it
   * @param options parameters of the flow
   * @returns flow's id
   */
  createFlow = async (options: FlowOptions): Promise<FlowId> => {
    const flowId = uuidV4();
    const flowKey = `flow:${flowId}`;
    await this.hSetAll(flowKey, options);
    await this.redis.rPush("queue:preparation:waiting", flowId);
    return flowId;
  };

  /**
   * Get preparation queue instance
   * @returns preparation queue instance
   */
  getPreparationQueue = () =>
    new Queue<PreparationJob, void>({
      redisClient: this.redis,
      logger: this.logger,
      lockTime: this.lockTime,
      queueName: "preparation",
      attributesToGet: ["recheckAccess"],
    });

  /**
   * Get access queue instance
   * @returns access queue instance
   */
  getAccessCheckQueue = () =>
    new Queue<AccessCheckJob, AccessCheckResult>({
      redisClient: this.redis,
      logger: this.logger,
      lockTime: this.lockTime,
      queueName: "access-check",
      attributesToGet: ["updateMemberships"],
    });
}
