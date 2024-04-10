import {
  BaseJobParams,
  BaseJobResult,
  ManagedJobFields,
} from "../../base/types";

export type PointsSnapshotLookupAttributes = "guildId";

export type PointsSnapshotJobOptions = {
  priority: number;
  guildId: number;
  guildPlatformId: string;
  snapshotId: number;
};

export type PointsSnapshotJobResult = BaseJobResult & { done: true };

export type PointsSnapshotJob = {
  queueName: "take-points-snapshot";
  children: [];
  params: BaseJobParams & PointsSnapshotJobOptions;
  result: PointsSnapshotJobResult;
};

export type PointsSnapshotContent = PointsSnapshotJobOptions &
  BaseJobParams &
  ManagedJobFields &
  PointsSnapshotJob["result"];
