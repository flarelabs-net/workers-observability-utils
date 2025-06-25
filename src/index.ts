/**
 * Workers Observability Utils
 *
 * A collection of utilities for capturing logs and metrics from Cloudflare Workers
 */

export * from "./metrics";
export * from "./tail";
export * from "./sinks/metrics/datadog";

import * as metrics from "./metrics";
import { TailExporter } from "./tail";
import { DatadogMetricSink } from "./sinks/metrics/datadog";
import { OtelMetricSink } from "./sinks/metrics/otel";
import { WorkersAnalyticsEngineSink } from "./sinks/metrics/workersAnalyticsEngine";
import { OtelLogSink } from "./sinks/logs/otel";

export { metrics, TailExporter, DatadogMetricSink, WorkersAnalyticsEngineSink, OtelMetricSink, OtelLogSink };

export default {
  metrics,
  TailExporter,
  DatadogMetricSink,
  WorkersAnalyticsEngineSink,
  OtelMetricSink,
  OtelLogSink
};
