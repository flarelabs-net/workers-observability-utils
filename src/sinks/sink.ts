import type { ExportedMetricPayload } from "../types";
import type { TraceItem } from "@cloudflare/workers-types";

export interface MetricSink {
  sendMetrics: (metrics: ExportedMetricPayload[]) => Promise<void>;
}

export interface LogSink {
  sendLogs: (traceItems: TraceItem[]) => Promise<void>;
}
