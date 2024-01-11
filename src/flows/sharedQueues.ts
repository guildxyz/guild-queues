import Queue from "../base/Queue";

// all manage reward child jobs only need the manageRewardAction attribute
const manageRewardAttributeToGet = ["manageRewardAction", "dataForAuditLog"];

export const manageRewardQueue = new Queue({
  queueName: "manage-reward",
  attributesToGet: [
    "children:manage-reward:params",
    "children:manage-reward:jobs",
  ],
  priorities: 2,
  nextQueueNameMap: new Map([
    ["access", "access-result"],
    ["status-update", "status-update-result"],
  ]),
  nextQueuePriorityDiffMap: new Map([["status-update", -1]]),
  maxRetries: 10, // this is for the parent queue only, not the child queues
  children: [
    {
      queueName: "discord",
      attributesToGet: manageRewardAttributeToGet,
      priorities: 2,
      delayable: true,
      limiter: {
        groupJobKey: "platformGuildId",
        intervalMs: 5 * 1000,
        reservoir: 5,
      },
    },
    {
      queueName: "telegram",
      attributesToGet: manageRewardAttributeToGet,
      priorities: 2,
    },
    {
      queueName: "github",
      attributesToGet: manageRewardAttributeToGet,
      priorities: 2,
    },
    {
      queueName: "google",
      attributesToGet: manageRewardAttributeToGet,
      priorities: 2,
    },
    {
      queueName: "nft",
      attributesToGet: manageRewardAttributeToGet,
      priorities: 2,
    },
  ],
});

export const accessCheckQueue = new Queue({
  queueName: "access-check",
  attributesToGet: [
    "userId",
    "guildId",
    "roleIds",
    "correlationId",
    "requirementIds",
  ],
  priorities: 2,
  nextQueueNameMap: new Map([
    ["access", "access-logic"],
    ["status-update", "bulk-access-logic"],
  ]),
  nextQueuePriorityDiffMap: new Map([
    ["status-update", -1], // decrease priority by one
  ]),
  maxRetries: 10, // this is for the parent queue only, not the child queues
  children: [
    {
      queueName: "requirement",
      attributesToGet: ["userId", "guildId", "roleId", "requirementId"],
      priorities: 2,
    },
    {
      queueName: "covalent",
      attributesToGet: ["userId", "guildId", "roleId", "requirementId"],
      priorities: 2,
      delayable: true,
      maxRetries: 1,
      limiter: {
        reservoir: 30, // 50 in prod, 4 otherwise, we use 30 here just to be safe because some checks may require more calls while others require none
        intervalMs: 1000,
      },
    },
  ],
});
