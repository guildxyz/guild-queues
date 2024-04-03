import Queue from "../../base/Queue";
import { QueueOptions } from "../../base/types";
import { FlowProps } from "../types";
import { PointsSnapshotJob } from "./types";

const getSnapshotProps = (): FlowProps => {
  const lookupAttributes = ["guildId"];

  const queueOptions: (QueueOptions<PointsSnapshotJob["queueName"]> | Queue)[] =
    [
      {
        queueName: "take-points-snapshot",
        attributesToGet: [
          // 2) ide ugyan az kell mint ami PointsSnapshotJobOptions-ben van
          "guildId",
          "doStatusUpddate",
        ],
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
