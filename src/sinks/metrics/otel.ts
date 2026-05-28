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
  enableNanoSecondTimestampJitter?: boolean;
  /**
   * WARNING: Enabling this option significantly increases metrics cardinality!
   * Each isolate will create separate metric series, which can lead to
   * storage and performance issues in your metrics backend.
   * Only enable if you need to track metrics per isolate instance.
   */
  enableIsolateId?: boolean;
}

export class OtelMetricSink implements MetricSink {
  private options: OtelMetricSinkOptions & {
    scopeName: string;
    scopeVersion: string;
  };
  private isolateId?: string;

  constructor(options: OtelMetricSinkOptions) {
    this.options = {
      scopeName: "workers-observability-utils",
      scopeVersion: "0.3.0",
      ...options,
    };
    
    if (options.enableIsolateId) {
      this.isolateId = Math.random().toString(36).substring(2, 15);
    }
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
        `Failed to send metrics to OTEL collector: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private buildOTLPPayload(
    metrics: ExportedMetricPayload[],
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
          "service.name": scriptName,
          "faas.trigger": trigger,
          "faas.version": versionId,
          ...(this.isolateId ? { "faas.instance": this.isolateId } : {}),
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
      },
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
        `HTTP ${response.status} ${response.statusText}: ${errorText}`,
      );
    }
  }

  private convertTagsToAttributes(
    tags?: Record<string, string | number | boolean | undefined | null>,
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
    attributes: KeyValue[],
  ) {
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

  private timestampToNanos(timestampMs: number): string {
    // Convert milliseconds to nanoseconds using BigInt to avoid precision loss
    const baseNanos = BigInt(Math.round(timestampMs)) * BigInt(1000000);
    
    if (this.options.enableNanoSecondTimestampJitter) {
      // Add entropy to nanosecond precision while preserving millisecond accuracy
      // Generate random nanoseconds between -499999 and +499999 to keep within same millisecond
      const jitterNanos = BigInt(Math.floor(Math.random() * 1000000) - 500000);
      return String(baseNanos + jitterNanos);
    }
    
    return String(baseNanos);
  }
}
