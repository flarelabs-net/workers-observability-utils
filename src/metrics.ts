import { type Channel, channel } from "node:diagnostics_channel";
import {
  type CountMetricPayload,
  type GaugeMetricPayload,
  type HistogramMetricPayload,
  type HistogramOptions,
  type DistributionMetricPayload,
  METRICS_CHANNEL_NAME,
  MetricType,
  type Tags,
} from "./types";

const metricsChannel: Channel = channel(METRICS_CHANNEL_NAME);

/**
 * Record a count metric
 * @param name - The metric name
 * @param value - The count value (incremented by)
 * @param tags - Optional tags
 */
export function count(name: string, value = 1, tags: Tags = {}): void {
  const payload: CountMetricPayload = {
    type: MetricType.COUNT,
    name,
    value,
    tags,
  };

  metricsChannel.publish(payload);
}

/**
 * Record a gauge metric
 * @param name - The metric name
 * @param value - The gauge value
 * @param tags - Optional tags
 */
export function gauge(name: string, value: number, tags: Tags = {}): void {
  const payload: GaugeMetricPayload = {
    type: MetricType.GAUGE,
    name,
    value,
    tags,
  };

  metricsChannel.publish(payload);
}

/**
 * Record a histogram metric
 * @param name - The metric name
 * @param value - The histogram value
 * @param options - Optional histogram configuration
 * @param tags - Optional tags
 */
export function histogram(
  name: string,
  value: number,
  options: HistogramOptions = {},
  tags: Tags = {},
): void {
  const payload: HistogramMetricPayload = {
    type: MetricType.HISTOGRAM,
    name,
    value,
    tags,
    options,
  };

  metricsChannel.publish(payload);
}

/**
 * Record a distribution metric
 * @param name - The metric name
 * @param value - The distribution value
 * @param tags - Optional tags
 */
export function distribution(name: string, value: number, tags: Tags = {}): void {
  const payload: DistributionMetricPayload = {
    type: MetricType.DISTRIBUTION,
    name,
    value,
    tags,
  };

  metricsChannel.publish(payload);
}

export default {
  count,
  gauge,
  histogram,
  distribution,
}
