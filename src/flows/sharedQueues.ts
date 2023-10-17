import Queue from "../base/Queue";

// all manage reward child jobs only need the manageRewardAction attribute
const manageRewardAttributeToGet = ["manageRewardAction"];

// eslint-disable-next-line import/prefer-default-export
export const manageRewardQueue = new Queue({
  queueName: "manage-reward",
  attributesToGet: [
    "children:manage-reward:params",
    "children:manage-reward:jobs",
  ],
  nextQueueMap: new Map([
    ["access", "access-result"],
    ["status-update", "status-update-result"],
  ]),
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
    },
    {
      queueName: "github",
      attributesToGet: manageRewardAttributeToGet,
    },
    {
      queueName: "google",
      attributesToGet: manageRewardAttributeToGet,
    },
    {
      queueName: "nft",
      attributesToGet: manageRewardAttributeToGet,
    },
  ],
});
