import { type ExportedMetricPayload, MetricType } from "../../types";

import {
  AggregationTemporality,
  type KeyValue,
  type OTLPMetricsPayload,
  type ResourceMetrics,
  type ScopeMetrics,
} from "./otel-metrics-types";

import type { MetricSink } from "../sink";

export interface OtelMetricSinkOptions {
  url: string;
  headers: Record<string, string>;
  scopeName?: string;
  scopeVersion?: string;
}

export class OtelMetricSink implements MetricSink {
  private options: OtelMetricSinkOptions & {
    scopeName: string;
    scopeVersion: string;
  };

  constructor(options: OtelMetricSinkOptions) {
    this.options = {
      scopeName: "workers-observability-utils",
      scopeVersion: "0.3.0",
      ...options,
    };
  }

  async sendMetrics(metrics: ExportedMetricPayload[]): Promise<void> {
    if (!metrics || metrics.length === 0) {
      return;
    }

    try {
      // Transform to OTLP format
      const otlpPayload = this.buildOTLPPayload(metrics);

      // Send via fetch
      await this.exportMetrics(otlpPayload);
    } catch (error) {
      throw new Error(
        `Failed to send metrics to OTEL collector: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private buildOTLPPayload(
    metrics: ExportedMetricPayload[]
  ): OTLPMetricsPayload {
    const otlpMetrics: (ResourceMetrics | undefined)[] = metrics.map(
      (payload) => {
        const name = payload.name;
        const {
          scriptName,
          executionModel,
          versionId,
          trigger,
          ...customTags
        } = payload.tags;

        const attributes = this.convertTagsToAttributes(customTags);
        const resourceAttributes = this.convertTagsToAttributes({
          "cloud.provider": "Cloudflare",
          "cloud.service":
            executionModel === "stateless" ? "Workers" : "Durable Objects",
          "cloud.region": "earth",
          "faas.name": scriptName,
          "faas.trigger": trigger,
          "faas.version": versionId,
        });

        const metric = this.payloadToMetric(payload, attributes);
        if (!metric) {
          return;
        }
        const scopeMetrics: ScopeMetrics = {
          scope: {
            name: this.options.scopeName,
            version: this.options.scopeVersion,
          },
          metrics: [metric],
        };

        const resourceMetrics: ResourceMetrics = {
          resource: {
            attributes: resourceAttributes,
          },
          scopeMetrics: [scopeMetrics],
        };
        return resourceMetrics;
      }
    );

    return {
      resourceMetrics: otlpMetrics.filter((el) => el) as ResourceMetrics[],
    };
  }

  private async exportMetrics(payload: OTLPMetricsPayload): Promise<void> {
    const url = this.options.url.endsWith("/v1/metrics")
      ? this.options.url
      : `${this.options.url}/v1/metrics`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.options.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${errorText}`
      );
    }
  }

  private convertTagsToAttributes(
    tags?: Record<string, string | number | boolean | undefined | null>
  ): KeyValue[] {
    return Object.entries(tags || {})
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({
        key,
        value: {
          stringValue: String(value),
        },
      }));
  }

  private payloadToMetric(
    payload: ExportedMetricPayload,
    attributes: KeyValue[]
  ) {
    if (payload.type === MetricType.HISTOGRAM) {
      return {
        name: payload.name,
        exponentialHistogram: {
          dataPoints: [
            this.buildExponentialHistogramDataPoint(
              payload.value,
              attributes
            ),
          ],
          aggregationTemporality:
            AggregationTemporality.AGGREGATION_TEMPORALITY_DELTA,
        },
      };
    }
    const timeUnixNano = this.timestampToNanos(payload.timestamp);
    if (payload.type === MetricType.COUNT) {
      return {
        name: payload.name,
        sum: {
          dataPoints: [
            {
              asInt: String(payload.value),
              attributes,
              timeUnixNano,
            },
          ],
          aggregationTemporality:
            AggregationTemporality.AGGREGATION_TEMPORALITY_DELTA,
          isMonotonic: true,
        },
      };
    }
    if (payload.type === MetricType.GAUGE) {
      return {
        name: payload.name,
        gauge: {
          dataPoints: [
            {
              asDouble: payload.value,
              attributes,
              timeUnixNano,
            },
          ],
        },
      };
    }
  }

  private buildExponentialHistogramDataPoint(
    values: { time: number; value: number }[],
    attributes: KeyValue[]
  ) {
    // Sort values to calculate buckets
    const sortedValues = values.map((v) => v.value).sort((a, b) => a - b);
    const count = String(sortedValues.length);
    const sum = sortedValues.reduce((acc, val) => acc + val, 0);

    // Use scale 0 for simplicity (base-2 exponential buckets)
    const scale = 0;
    const zeroCount = String(sortedValues.filter((v) => v === 0).length);

    // Build positive buckets for exponential histogram
    const positive = this.buildExponentialBuckets(
      sortedValues.filter((v) => v > 0)
    );
    const negative = this.buildExponentialBuckets(
      sortedValues.filter((v) => v < 0).map((v) => Math.abs(v))
    );

    return {
      attributes,
      count,
      startTimeUnixNano: this.timestampToNanos(
        values.length > 0 ? values[0].time : Date.now()
      ),
      timeUnixNano: this.timestampToNanos(
        values.length > 0 ? values[values.length - 1].time : Date.now()
      ),
      sum,
      scale,
      zeroCount,
      ...(positive.bucketCounts.length > 0 && { positive }),
      ...(negative.bucketCounts.length > 0 && { negative }),
    };
  }

  private buildExponentialBuckets(values: number[]) {
    if (values.length === 0) {
      return { offset: 0, bucketCounts: [] };
    }

    // For scale 0, bucket boundaries are powers of 2: [1, 2), [2, 4), [4, 8), etc.
    const buckets = new Map<number, number>();

    for (const value of values) {
      // Calculate bucket index for scale 0: floor(log2(value))
      const bucketIndex = value <= 0 ? 0 : Math.floor(Math.log2(value));
      buckets.set(bucketIndex, (buckets.get(bucketIndex) || 0) + 1);
    }

    const minBucket = Math.min(...buckets.keys());
    const maxBucket = Math.max(...buckets.keys());
    const bucketCounts: string[] = [];

    for (let i = minBucket; i <= maxBucket; i++) {
      bucketCounts.push(String(buckets.get(i) || 0));
    }

    return {
      offset: minBucket,
      bucketCounts,
    };
  }

  private timestampToNanos(timestampMs: number): string {
    // Convert milliseconds to nanoseconds using BigInt to avoid precision loss
    return String(BigInt(Math.round(timestampMs)) * BigInt(1000000));
  }
}
