import { METRICS_CHANNEL_NAME, type MetricPayload, MetricType } from "./types";
import { MetricsDb } from "./metricsDb";
import type { TraceItem } from "@cloudflare/workers-types";
import type { MetricSink } from "./sinks/sink";
import { getEventTrigger } from "./utils/cloudflare";
export { DatadogMetricSink } from "./sinks/datadog";
export { WorkersAnalyticsEngineSink } from "./sinks/workersAnalyticsEngine";
export { OtelMetricSink } from "./sinks/otel";

export interface TailExporterOptions {
  metrics?: {
    sinks: MetricSink[];
    defaultMetrics?: {
      cpuTime?: boolean; // default: true;
      wallTime?: boolean; // default: true;
      workersInvocation?: boolean; // default: true;
    };
    /**
     * Max number of unique metrics to buffer before flushing.
     * Metric Uniqueness is defined by a combination of name and tags
     * Default: 25
     */
    maxBufferSize?: number;
    /**
     * Max duration in Seconds to buffer before flushing.
     * Default: 5 Seconds
     */
    maxBufferDuration?: number;
  };
}

export class TailExporter {
  #metricSinks?: MetricSink[];
  #maxBufferSize: number;
  #maxBufferDuration: number;
  #flushId = 0;
  #metrics = new MetricsDb();
  #flushScheduled = false;
  #defaultMetricsEnabled: {
    cpuTime: boolean;
    wallTime: boolean;
    workersInvocation: boolean;
  };

  constructor({ metrics }: TailExporterOptions) {
    this.#metricSinks = metrics?.sinks;
    this.#maxBufferSize = metrics?.maxBufferSize || 100;
    this.#maxBufferDuration = Math.min(metrics?.maxBufferDuration || 5, 30);

    // Set default metrics configuration (all enabled by default)
    this.#defaultMetricsEnabled = {
      cpuTime: metrics?.defaultMetrics?.cpuTime !== false,
      wallTime: metrics?.defaultMetrics?.wallTime !== false,
      workersInvocation: metrics?.defaultMetrics?.workersInvocation !== false,
    };
  }

  tail(traceItems: TraceItem[], env: unknown, ctx: ExecutionContext) {
    for (const traceItem of traceItems) {
      const metricEvents = traceItem.diagnosticsChannelEvents.filter(
        (el) => el.channel === METRICS_CHANNEL_NAME,
      );

      const trigger = getEventTrigger(traceItem);

      const globalTags = {
        scriptName: traceItem.scriptName,
        executionModel: traceItem.executionModel,
        outcome: traceItem.outcome,
        versionId: traceItem.scriptVersion?.id,
        trigger,
      };

      // Add default metrics if enabled
      this.#addDefaultMetrics(traceItem, globalTags);

      for (const event of metricEvents) {
        const message = event.message;
        if (isValidMetric(message)) {
          this.#metrics.storeMetric({
            ...message,
            tags: {
              ...globalTags,
              ...message.tags,
            },
            timestamp: event.timestamp,
          });
        } else {
          console.warn("Received invalid metric payload:", message);
        }
      }
    }

    if (this.#metrics.getMetricCount() >= this.#maxBufferSize) {
      if (this.#flushScheduled) {
        this.#flushScheduled = false;
      }

      this.#flushId++;
      // Flush immediately
      ctx.waitUntil(this.#performFlush());
      return;
    }

    if (this.#flushScheduled) {
      return;
    }

    // Only schedule flush if there are metrics to flush
    if (this.#metrics.getMetricCount() > 0) {
      this.#flushScheduled = true;
      const scheduleFlush = async () => {
        try {
          const localFlushId = ++this.#flushId;
          await scheduler.wait(this.#maxBufferDuration * 1000);

          if (localFlushId === this.#flushId) {
            await this.#performFlush();
          }
        } catch (error) {}
      };

      ctx.waitUntil(scheduleFlush());
    }
  }

  async #performFlush(): Promise<void> {
    const items = this.#metrics.toMetricPayloads();

    // Reset batch and flush state
    this.#flushScheduled = false;
    this.#metrics.clearAll();

    // Skip if no items to flush
    if (items.length === 0) {
      return;
    }

    try {
      if (this.#metricSinks) {
        const results = await Promise.allSettled(
          this.#metricSinks?.filter(sink => !sink.streaming).map((sink) => sink.sendMetrics(items)),
        );
        const errors = results.filter((el) => el.status === "rejected") as PromiseRejectedResult[];
        if (errors.length > 0) {
          const sinkErrors = errors.map((error, index) => {
            return `${error.reason instanceof Error ? error.reason.message : String(error.reason)}`;
          });
          console.error(`Failed to flush metrics to ${errors.length} sink(s): ${sinkErrors.join(', ')}`);
        }
      }
    } catch (error) {
      console.error("Error flushing batch:", error);
    }
  }

  #addDefaultMetrics(
    traceItem: TraceItem,
    globalTags: Record<string, string | number | boolean | undefined | null>,
  ): void {
    if (this.#defaultMetricsEnabled.cpuTime) {
      this.#metrics.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "worker.cpu_time",
        value: traceItem.cpuTime,
        tags: globalTags,
        timestamp: traceItem.eventTimestamp || Date.now(),
        options: {
          aggregates: ["max", "min", "avg"],
          percentiles: [0.5, 0.75, 0.9, 0.95, 0.99],
        },
      });
    }

    if (this.#defaultMetricsEnabled.wallTime) {
      this.#metrics.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "worker.wall_time",
        value: traceItem.wallTime,
        tags: globalTags,
        timestamp: traceItem.eventTimestamp || Date.now(),
        options: {
          aggregates: ["max", "min", "avg"],
          percentiles: [0.5, 0.75, 0.9, 0.95, 0.99],
        },
      });
    }
    if (this.#defaultMetricsEnabled.workersInvocation) {
      this.#metrics.storeMetric({
        type: MetricType.COUNT,
        name: "worker.invocation",
        value: 1,
        tags: globalTags,
        timestamp: traceItem.eventTimestamp || Date.now(),
      });
    }
  }
}

function isValidMetric(message: unknown): message is MetricPayload {
  // Check if message is an object with all required properties
  if (
    message === null ||
    typeof message !== "object" ||
    !("type" in message) ||
    !("name" in message) ||
    !("value" in message) ||
    !("tags" in message)
  ) {
    return false;
  }

  const metricMsg = message as Partial<MetricPayload>;

  // Check if type is one of the valid MetricType values
  if (!Object.values(MetricType).includes(metricMsg.type as MetricType)) {
    return false;
  }

  // Validate field types (same for all metric types)
  return (
    typeof metricMsg.value === "number" &&
    typeof metricMsg.name === "string" &&
    typeof metricMsg.tags === "object"
  );
}
