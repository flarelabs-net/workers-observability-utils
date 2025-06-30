import { calculateHistogramValue, calculatePercentile } from "./utils/maths";
import {
  type HistogramAggregates,
  type MetricPayload,
  type ExportedMetricPayload,
  MetricType,
  type Tags,
  EmittedMetricPayload,
} from "./types";

interface BaseStoredMetric {
  name: string;
  tags: Tags;
  lastUpdated: number;
}

interface StoredCountMetric extends BaseStoredMetric {
  type: MetricType.COUNT;
  value: number;
}

interface StoredGaugeMetric extends BaseStoredMetric {
  type: MetricType.GAUGE;
  value: number;
}

interface StoredHistogramMetric extends BaseStoredMetric {
  type: MetricType.HISTOGRAM;
  value: {
    time: number;
    value: number;
  }[];
}

type StoredMetric =
  | StoredCountMetric
  | StoredGaugeMetric
  | StoredHistogramMetric;

function serializeTags(tags: Tags): string {
  return Object.entries(tags)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

export class MetricsDb {
  private metrics: Map<string, StoredMetric> = new Map();
  private getMetricKey(metric: MetricPayload): string {
    const tagKey = serializeTags(metric.tags);
    return `${metric.name}:${metric.type}:${tagKey}`;
  }

  public storeMetric(metric: EmittedMetricPayload): void {
    const key = this.getMetricKey(metric);
    const existingMetric = this.metrics.get(key);

    switch (metric.type) {
      case MetricType.COUNT: {
        const newValue = existingMetric
          ? (existingMetric.value as number) + Number(metric.value)
          : Number(metric.value);

        this.metrics.set(key, {
          type: metric.type,
          name: metric.name,
          tags: metric.tags,
          value: newValue,
          lastUpdated: metric.timestamp,
        });
        break;
      }

      case MetricType.GAUGE: {
        this.metrics.set(key, {
          type: metric.type,
          name: metric.name,
          tags: metric.tags,
          value: Number(metric.value),
          lastUpdated: metric.timestamp,
        });
        break;
      }

      case MetricType.HISTOGRAM: {
        const existingValue = existingMetric
          ? (existingMetric.value as { value: number; time: number }[])
          : [];
        this.metrics.set(key, {
          type: metric.type,
          name: metric.name,
          tags: metric.tags,

          value: [
            ...existingValue,
            {
              value: Number(metric.value),
              time: metric.timestamp,
            },
          ],
          lastUpdated: metric.timestamp,
        });
      }
    }
  }

  public storeMetrics(
    metrics: (MetricPayload & { timestamp: number })[]
  ): void {
    for (const metric of metrics) {
      this.storeMetric(metric);
    }
  }

  /**
   * Get all stored metrics
   */
  public getAllMetrics(): StoredMetric[] {
    return Array.from(this.metrics.values());
  }

  public clearAll(): void {
    this.metrics.clear();
  }

  public getMetricCount(): number {
    return this.metrics.size;
  }

  /**
   * Get the Metrics in a format ready to export to various different sinks
   * @param flushWindowS
   */
  public toMetricPayloads(): ExportedMetricPayload[] {
    const payloads: ExportedMetricPayload[] = [];

    for (const metric of this.metrics.values()) {
      switch (metric.type) {
        case MetricType.COUNT:
        case MetricType.GAUGE:
          payloads.push({
            type: metric.type,
            name: metric.name,
            value: metric.value as number,
            tags: metric.tags,
            timestamp: metric.lastUpdated,
          });
          break;
        case MetricType.HISTOGRAM: {
          payloads.push({
            type: MetricType.HISTOGRAM,
            name: metric.name,
            value: metric.value,
            tags: metric.tags,
          });
          break;
        }
      }
    }

    return payloads;
  }
}
