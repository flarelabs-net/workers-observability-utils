/**
 * Workers Observability Utils
 *
 * A collection of utilities for capturing logs and metrics from Cloudflare Workers
 */

export * from "./metrics";
export * from "./tail";
export * from "./sinks/datadog";

import * as metrics from "./metrics";
import { TailExporter } from "./tail";
import { DatadogMetricSink } from "./sinks/datadog";
import { OtelMetricSink } from "./sinks/otel";
import { WorkersAnalyticsEngineSink } from "./sinks/workersAnalyticsEngine";

export { metrics, TailExporter, DatadogMetricSink, WorkersAnalyticsEngineSink, OtelMetricSink };

export default {
  metrics,
  TailExporter,
  DatadogMetricSink,
  WorkersAnalyticsEngineSink,
  OtelMetricSink
};
