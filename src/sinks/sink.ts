import type { ExportedMetricPayload } from "../types";

export interface MetricSink {
  sendMetrics: (metrics: ExportedMetricPayload[]) => Promise<void>;
}

export interface LogSink {
  sendLogs: (traceItems: TraceItem[]) => Promise<void>;
}
