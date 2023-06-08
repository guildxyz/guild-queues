// import { v4 as uuidV4 } from "uuid";
// import { RedisClientOptions, createClient } from "redis";
// import Queue from "../base/Queue";
// import { objectToStringEntries, parseObject } from "../utils";
// import { RedisClient, WorkerFunction } from "../base/types";
// import {
//   AccessFlowOptions,
//   CreateAccessFlowOptions,
//   PreparationJob,
//   PreparationResult,
//   AccessCheckJob,
//   AccessCheckResult,
//   UpdateMembershipJob,
//   UpdateMembershipResult,
//   ManageRewardJob,
//   PrepareManageRewardJob,
//   PrepareManageRewardResult,
// } from "./types";
// import AccessWorker from "./workers/AccessWorker";
// import PrepareManageRewardWorker from "./workers/PrepareManageRewardWorker";
// import ManageRewardWorker from "./workers/ManageRewardWorker";
//
// /**
//  * Class to store queues, instantiate workers, and create flows
//  */
// export default class AccessFlow {
//   /**
//    * Prefix of the state key-value pair's keys
//    */
//   static flowPrefix: string = "flow";
//
//   /**
//    * Default state attributes to query when fetching a job
//    */
//   static defaultAttributesToGet: string[] = ["userId", "roleIds"];
//
//   /**
//    * Preparation queue instance
//    */
//   readonly preparationQueue: Queue;
//
//   /**
//    * Access-check queue instance
//    */
//   readonly accessCheckQueue: Queue;
//
//   /**
//    * Update-membership queue instance
//    */
//   readonly updateMembershipQueue: Queue;
//
//   /**
//    * Prepare-manage-reward queue instance
//    */
//   readonly prepareManageRewardQueue: Queue;
//
//   /**
//    * Send-response queue instance
//    */
//   readonly sendResponseQueue: Queue;
//
//   readonly childQueues: Map<string, Queue> = new Map();
//
//   /**
//    * Options to create redis connections
//    */
//   readonly redisClientOptions: RedisClientOptions;
//
//   /**
//    * Redis client instance
//    */
//   private redis: RedisClient;
//
//   /**
//    * Set the basic options, initialize queues and redis client
//    * @param options parameters of AccessFlow
//    */
//   constructor(options: AccessFlowOptions) {
//     this.redisClientOptions = options.redisClientOptions;
//     this.redis = createClient(options.redisClientOptions);
//
//     this.preparationQueue = new Queue({
//       queueName: "preparation",
//       attributesToGet: [...AccessFlow.defaultAttributesToGet, "recheckAccess"],
//     });
//     this.accessCheckQueue = new Queue({
//       queueName: "access-check",
//       attributesToGet: [
//         ...AccessFlow.defaultAttributesToGet,
//         "updateMemberships",
//       ],
//     });
//     this.updateMembershipQueue = new Queue({
//       queueName: "update-membership",
//       attributesToGet: [
//         ...AccessFlow.defaultAttributesToGet,
//         "accessCheckResult",
//         "manageRewards",
//       ],
//     });
//     this.prepareManageRewardQueue = new Queue({
//       queueName: "prepare-manage-reward",
//       attributesToGet: [
//         ...AccessFlow.defaultAttributesToGet,
//         "updateMembershipResult",
//         "guildId",
//         "forceRewardActions",
//         "onlyForThisPlatform",
//       ],
//     });
//   }
//
//   /**
//    * Connect to redis client
//    */
//   connect = async () => {
//     await this.redis.connect();
//   };
//
//   /**
//    * Disconnect from redis client
//    */
//   disconnect = async () => {
//     await this.redis.disconnect();
//   };
//
//   /**
//    * Create an access flow and put it in the first queue
//    * @param options parameters of the flow
//    * @returns flow's id
//    */
//   createFlow = async (options: CreateAccessFlowOptions): Promise<string> => {
//     // generate id for the flow
//     const flowId = uuidV4();
//     const flowKey = `${AccessFlow.flowPrefix}:${flowId}`;
//
//     const transaction = this.redis
//       .multi()
//       // create the state with the parameters
//       .hSet(flowKey, objectToStringEntries(options))
//       // lookup by userId
//       .rPush(`${AccessFlow.flowPrefix}:userId:${options.userId}`, flowId)
//       // lookup by guildId
//       .rPush(`${AccessFlow.flowPrefix}:guildId:${options.guildId}`, flowId);
//
//     // lookup by roleIds
//     options.roleIds.forEach((roleId) => {
//       transaction.rPush(`${AccessFlow.flowPrefix}:roleId:${roleId}`, flowId);
//     });
//
//     // put to the first queue
//     transaction.rPush(this.preparationQueue.waitingQueueKey, flowId);
//
//     // execute transaction
//     await transaction.exec();
//
//     return flowId;
//   };
//
//   /**
//    * Get flow states by flowIds
//    * @param flowIds flowIds to get
//    * @returns flow states
//    */
//   private getFlows = async (flowIds: string[]) => {
//     const transaction = this.redis.multi();
//     flowIds.forEach((flowId) => {
//       const flowKey = `${AccessFlow.flowPrefix}:${flowId}`;
//       transaction.hGetAll(flowKey);
//     });
//     const flows = await transaction.exec();
//     return flows.map((f) => parseObject(f as any));
//   };
//
//   /**
//    * Get flow stated by some ids
//    * @param keyName name of the id
//    * @param value value of the id
//    * @returns flow states
//    */
//   getFlowsById = async (
//     keyName: "userId" | "roleId" | "guildId",
//     value: number
//   ) => {
//     const flowIds = await this.redis.lRange(
//       `${AccessFlow.flowPrefix}:${keyName}:${value}`,
//       0,
//       -1
//     );
//     return this.getFlows(flowIds);
//   };
//
//   /**
//    * Get a preparation worker instance
//    * @param lockTime a job will be locked for this amount of time
//    * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
//    * @returns Worker instance
//    */
//   getPreparationWorker = (
//     workerFunction: WorkerFunction<PreparationJob, PreparationResult>,
//     lockTime?: number,
//     waitTimeout?: number
//   ): AccessWorker<PreparationJob, PreparationResult> =>
//     new AccessWorker({
//       queue: this.preparationQueue,
//       redisClientOptions: this.redisClientOptions,
//       workerFunction,
//       lockTime,
//       waitTimeout,
//     });
//
//   /**
//    * Get an access-check worker instance
//    * @param lockTime a job will be locked for this amount of time
//    * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
//    * @returns Worker instance
//    */
//   getAccessCheckWorker = (
//     workerFunction: WorkerFunction<AccessCheckJob, AccessCheckResult>,
//     lockTime?: number,
//     waitTimeout?: number
//   ): AccessWorker<AccessCheckJob, AccessCheckResult> =>
//     new AccessWorker({
//       queue: this.accessCheckQueue,
//       redisClientOptions: this.redisClientOptions,
//       workerFunction,
//       lockTime,
//       waitTimeout,
//     });
//
//   /**
//    * Get an update-membership worker instance
//    * @param lockTime a job will be locked for this amount of time
//    * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
//    * @returns Worker instance
//    */
//   getUpdateMembershipWorker = (
//     workerFunction: WorkerFunction<UpdateMembershipJob, UpdateMembershipResult>,
//     lockTime?: number,
//     waitTimeout?: number
//   ): AccessWorker<UpdateMembershipJob, UpdateMembershipResult> =>
//     new AccessWorker({
//       queue: this.updateMembershipQueue,
//       redisClientOptions: this.redisClientOptions,
//       workerFunction,
//       lockTime,
//       waitTimeout,
//     });
//
//   /**
//    * Get an prepare-manage-reward worker instance
//    * @param lockTime a job will be locked for this amount of time
//    * @param waitTimeout the worker will wait this amount of time before checking if it is stopped
//    * @returns Worker instance
//    */
//   getPrepareManageRewardWorker = (
//     workerFunction: WorkerFunction<
//       PrepareManageRewardJob,
//       PrepareManageRewardResult
//     >,
//     lockTime?: number,
//     waitTimeout?: number
//   ): PrepareManageRewardWorker =>
//     new PrepareManageRewardWorker({
//       queue: this.prepareManageRewardQueue,
//       redisClientOptions: this.redisClientOptions,
//       workerFunction,
//       lockTime,
//       waitTimeout,
//     });
//
//   public getChildQueue = (childQueueName: string) => {
//     let childQueue = this.childQueues.get(childQueueName);
//     if (!childQueue) {
//       childQueue = new Queue({
//         queueName: childQueueName,
//       });
//       this.childQueues.set(childQueueName, childQueue);
//     }
//     return childQueue;
//   };
//
//   getManageRewardWorker = (
//     platform: string,
//     workerFunction: WorkerFunction<ManageRewardJob, any>,
//     lockTime?: number,
//     waitTimeout?: number
//   ): ManageRewardWorker => {
//     const childQueue = this.getChildQueue(`manage-reward:${platform}`);
//     return new ManageRewardWorker({
//       queue: childQueue,
//       redisClientOptions: this.redisClientOptions,
//       workerFunction,
//       lockTime,
//       waitTimeout,
//     });
//   };
// }
