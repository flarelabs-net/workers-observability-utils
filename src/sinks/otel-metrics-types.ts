export enum AggregationTemporality {
  AGGREGATION_TEMPORALITY_UNSPECIFIED = 0,
  AGGREGATION_TEMPORALITY_DELTA = 1,
  AGGREGATION_TEMPORALITY_CUMULATIVE = 2,
}

export interface KeyValue {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

export interface NumberDataPoint {
  attributes: KeyValue[];
  timeUnixNano: string;
  startTimeUnixNano?: string;
  asInt?: string;
  asDouble?: number;
}

export interface Gauge {
  dataPoints: NumberDataPoint[];
}

export interface Sum {
  dataPoints: NumberDataPoint[];
  aggregationTemporality: AggregationTemporality;
  isMonotonic: boolean;
}

export interface Metric {
  name: string;
  description?: string;
  unit?: string;
  gauge?: Gauge;
  sum?: Sum;
}

export interface InstrumentationScope {
  name: string;
  version?: string;
}

export interface Resource {
  attributes: KeyValue[];
}

export interface ScopeMetrics {
  scope?: InstrumentationScope;
  metrics: Metric[];
}

export interface ResourceMetrics {
  resource?: Resource;
  scopeMetrics: ScopeMetrics[];
}

export interface OTLPMetricsPayload {
  resourceMetrics: ResourceMetrics[];
}

// Type guards for discriminating metric types
export function isGaugeMetric(
  metric: Metric,
): metric is Metric & { gauge: Gauge } {
  return metric.gauge !== undefined;
}

export function isSumMetric(metric: Metric): metric is Metric & { sum: Sum } {
  return metric.sum !== undefined;
}
