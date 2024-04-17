import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { POINTS_SNAPSHOT_QUEUE_MAX_RETRIES } from "../../static";
import { FlowProps } from "../types";
import { PointsSnapshotJob } from "./types";

const getSnapshotProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (QueueOptions<PointsSnapshotJob["queueName"]> | Queue)[] =
    [
      {
        queueName: "take-points-snapshot",
        attributesToGet: [
          "guildId",
          "guildPlatformId",
          "snapshotId",
          "shouldStatusUpdate",
        ],
        maxRetries: POINTS_SNAPSHOT_QUEUE_MAX_RETRIES,
      },
    ];

  const queues = queueOptions.map((queueOption) => {
    if (queueOption instanceof Queue) {
      return queueOption;
    }
    return new Queue(queueOption);
  });

  return {
    queues,
    lookupAttributes,
  };
};

export default getSnapshotProps;
