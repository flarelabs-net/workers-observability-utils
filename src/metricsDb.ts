import { calculateHistogramValue, calculatePercentile } from "./utils/maths";
import {
  type HistogramAggregates,
  type MetricPayload,
  type ExportedMetricPayload,
  MetricType,
  type Tags,
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
  value: number[];
  percentiles?: number[];
  aggregates?: HistogramAggregates[];
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

  public storeMetric(metric: ExportedMetricPayload): void {
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
          ? (existingMetric.value as number[])
          : [];
        this.metrics.set(key, {
          type: metric.type,
          name: metric.name,
          tags: metric.tags,
          percentiles: metric.options?.percentiles,
          aggregates: metric.options?.aggregates,
          value: [...existingValue, metric.value],
          lastUpdated: metric.timestamp,
        });
      }
    }
  }

  public storeMetrics(
    metrics: (MetricPayload & { timestamp: number })[],
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
    const flushTimestamp = Date.now();

    for (const metric of this.metrics.values()) {
      switch (metric.type) {
        case MetricType.COUNT:
        case MetricType.GAUGE:
          payloads.push({
            type: metric.type,
            name: metric.name,
            value: metric.value as number,
            tags: metric.tags,
            timestamp: flushTimestamp,
          });
          break;
        case MetricType.HISTOGRAM: {
          const sortedArray = [...metric.value].sort();

          for (const percentile of metric.percentiles || []) {
            const value = calculatePercentile(sortedArray, percentile);
            payloads.push({
              type: MetricType.GAUGE,
              name: `${metric.name}.p${Math.round(percentile * 100)}`,
              value: value,
              tags: metric.tags,
              timestamp: flushTimestamp,
            });
          }

          for (const aggregate of metric.aggregates || []) {
            const value = calculateHistogramValue(aggregate, metric.value);

            payloads.push({
              type: aggregate === "count" ? MetricType.COUNT : MetricType.GAUGE,
              name: `${metric.name}.${aggregate}`,
              value: value,
              tags: metric.tags,
              timestamp: flushTimestamp,
            });
          }
        }
      }
    }

    return payloads;
  }
}
