import Queue from "../base/Queue";

const sharedQueuePriorities = 2;
const parentQueueMaxRetries = 10; // this is for the parent queue only, not the child queues

const manageRewardAttributeToGet = ["manageRewardAction", "dataForAuditLog"];
const accessCheckAttributeToGet = [
  "userId",
  "guildId",
  "roleId",
  "requirementId",
];

export const manageRewardQueue = new Queue({
  queueName: "manage-reward",
  attributesToGet: [
    "children:manage-reward:params",
    "children:manage-reward:jobs",
  ],
  priorities: sharedQueuePriorities,
  nextQueueNameMap: new Map([
    ["access", "access-result"],
    ["status-update", "status-update-result"],
  ]),
  nextQueuePriorityDiffMap: new Map([["status-update", -1]]),
  maxRetries: parentQueueMaxRetries,
  children: [
    {
      queueName: "discord",
      attributesToGet: manageRewardAttributeToGet,
      priorities: sharedQueuePriorities,
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
      priorities: sharedQueuePriorities,
    },
    {
      queueName: "github",
      attributesToGet: manageRewardAttributeToGet,
      priorities: sharedQueuePriorities,
    },
    {
      queueName: "google",
      attributesToGet: manageRewardAttributeToGet,
      priorities: sharedQueuePriorities,
    },
    {
      queueName: "nft",
      attributesToGet: manageRewardAttributeToGet,
      priorities: sharedQueuePriorities,
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
  priorities: sharedQueuePriorities,
  nextQueueNameMap: new Map([
    ["access", "access-logic"],
    ["status-update", "bulk-access-logic"],
  ]),
  nextQueuePriorityDiffMap: new Map([
    ["status-update", -1], // decrease priority by one (restore to previous priority)
  ]),
  maxRetries: parentQueueMaxRetries,
  children: [
    {
      queueName: "requirement",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
    },
    {
      queueName: "galxe",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
    },
    {
      queueName: "covalent",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
      delayable: true,
      // maxRetries: 1, // temp disabled 2024.01.31.
      limiter: {
        reservoir: 30, // 50RPS in prod, 4RPS otherwise, we usually use a bit less here just to be safe because some checks may require more calls while others require none
        intervalMs: 1000,
      },
    },
    {
      queueName: "farcaster",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
      delayable: true,
      limiter: {
        reservoir: 18, // 20 RPS is the limit
        intervalMs: 1000,
      },
    },
    {
      queueName: "eas",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
      delayable: true,
      limiter: {
        reservoir: 10,
        intervalMs: 1000,
      },
    },
    {
      queueName: "guild",
      attributesToGet: accessCheckAttributeToGet,
      priorities: sharedQueuePriorities,
      maxRetries: 1,
    },
  ],
});
