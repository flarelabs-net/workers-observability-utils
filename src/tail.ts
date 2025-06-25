import type { TraceItem } from "@cloudflare/workers-types";
import { MetricsTail, type MetricTailOptions } from "./metricsTail";
import { LogsTail, type LogTailOptions } from "./logsTail";
export { DatadogMetricSink } from "./sinks/metrics/datadog";
export { WorkersAnalyticsEngineSink } from "./sinks/metrics/workersAnalyticsEngine";
export { OtelMetricSink } from "./sinks/metrics/otel";
export { OtelLogSink } from "./sinks/logs/otel";

export interface TailExporterOptions {
  metrics?: MetricTailOptions;
  logs?: LogTailOptions;
}

export class TailExporter {
  #metricsTail?: MetricsTail;
  #logsTail?: LogsTail;
  constructor({ metrics, logs }: TailExporterOptions) {
    if (metrics && metrics.sinks.length > 0) {
      this.#metricsTail = new MetricsTail(metrics);
    }

    if (logs && logs.sinks.length > 0) {
      this.#logsTail = new LogsTail(logs);
    }
  }

  tail(traceItems: TraceItem[], _env: unknown, ctx: ExecutionContext) {
    if (this.#metricsTail) {
      this.#metricsTail.processTraceItems(traceItems, ctx);
    }

    if (this.#logsTail) {
      this.#logsTail.processTraceItems(traceItems, ctx);
    }
  }
}
