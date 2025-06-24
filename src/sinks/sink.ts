import type { ExportedMetricPayload } from "../types";

export interface MetricSink {
  streaming?: boolean;
  sendMetrics: (metrics: ExportedMetricPayload[]) => Promise<void>;
}
