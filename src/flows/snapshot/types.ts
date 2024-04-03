import {
  BaseJobParams,
  BaseJobResult,
  ManagedJobFields,
} from "../../base/types";

// Message => snpshost mindent

export type PointsSnapshotLookupAttributes = "guildId";

export type PointsSnapshotJobOptions = {
  priority: number;
  guildId: number;
  doStatusUpddate: boolean; // 1) ide kell belerakni hogy mi lesz a workerFunction parametereben
};

export type PointsSnapshotJobResult = BaseJobResult & { done: true };

export type PointsSnapshotJob = {
  queueName: "take-points-snaphost";
  children: [];
  params: BaseJobParams & PointsSnapshotJobOptions;
  result: PointsSnapshotJobResult;
};

export type PointsSnapshotContent = PointsSnapshotJobOptions &
  BaseJobParams &
  ManagedJobFields &
  PointsSnapshotJob["result"];
