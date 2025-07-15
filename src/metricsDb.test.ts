import { describe, it, expect, beforeEach, vi } from "vitest";
import { MetricsDb } from "./metricsDb";
import {
  MetricType,
  type ExportedMetricPayload,
  type HistogramAggregates,
} from "./types";

describe("MetricsDb", () => {
  let metricsDb: MetricsDb;

  beforeEach(() => {
    metricsDb = new MetricsDb();
    vi.useFakeTimers();
  });

  describe("storeMetric", () => {
    it("should accumulate count metrics with same key", () => {
      const baseMetric = {
        type: MetricType.COUNT,
        name: "test.counter",
        tags: { service: "api" },
      } as const;

      metricsDb.storeMetric({
        ...baseMetric,
        value: 5,
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        ...baseMetric,
        value: 3,
        timestamp: 2000,
      });

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0].value).toBe(8);
      expect(metrics[0].lastUpdated).toBe(2000);
    });

    it("should overwrite gauge metrics with same key", () => {
      const baseMetric = {
        type: MetricType.GAUGE,
        name: "test.gauge",
        tags: { region: "us-east-1" },
      } as const;

      metricsDb.storeMetric({
        ...baseMetric,
        value: 100,
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        ...baseMetric,
        value: 200,
        timestamp: 2000,
      });

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0].value).toBe(200);
      expect(metrics[0].lastUpdated).toBe(2000);
    });

    it("should store a histogram metric", () => {
      const metric: ExportedMetricPayload = {
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 150,
        tags: { endpoint: "/api/users" },
        timestamp: Date.now(),
        options: {
          percentiles: [0.5, 0.95],
          aggregates: ["max", "min"] as HistogramAggregates[],
        },
      };

      metricsDb.storeMetric(metric);

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0]).toEqual({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: [150],
        tags: { endpoint: "/api/users" },
        percentiles: [0.5, 0.95],
        aggregates: ["max", "min"],
        lastUpdated: metric.timestamp,
      });
    });

    it("should accumulate histogram values with same key", () => {
      const baseMetric = {
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        tags: { endpoint: "/api/users" },
        options: {
          percentiles: [0.5],
          aggregates: ["max"] as HistogramAggregates[],
        },
      };

      metricsDb.storeMetric({
        ...baseMetric,
        value: 100,
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        ...baseMetric,
        value: 200,
        timestamp: 2000,
      });

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0].value).toEqual([100, 200]);
      expect(metrics[0].lastUpdated).toBe(2000);
    });

    it("should group metric keys based on name, type, and tags", () => {
      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.metric",
        value: 1,
        tags: { service: "api" },
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        type: MetricType.GAUGE,
        name: "test.metric",
        value: 2,
        tags: { service: "api" },
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.metric",
        value: 3,
        tags: { service: "api" },
        timestamp: 1000,
      });

      expect(metricsDb.getMetricCount()).toBe(2);
    });
  });

  describe("storeMetrics", () => {
    it("should store multiple metrics", () => {
      const metrics = [
        {
          type: MetricType.COUNT,
          name: "test.counter",
          value: 5,
          tags: { service: "api" },
          timestamp: 1000,
        } as const,
        {
          type: MetricType.GAUGE,
          name: "test.gauge",
          value: 100,
          tags: { region: "us-east-1" },
          timestamp: 2000,
        } as const,
      ];

      metricsDb.storeMetrics(metrics);

      expect(metricsDb.getMetricCount()).toBe(2);
    });
  });

  describe("clearAll", () => {
    it("should clear all stored metrics", () => {
      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: { service: "api" },
        timestamp: Date.now(),
      });

      expect(metricsDb.getMetricCount()).toBe(1);

      metricsDb.clearAll();

      expect(metricsDb.getMetricCount()).toBe(0);
      expect(metricsDb.getAllMetrics()).toEqual([]);
    });
  });

  describe("toMetricPayloads", () => {
    it("should export count and gauge metrics with flush timestamp", () => {
      const mockFlushTime = 5000;
      vi.setSystemTime(mockFlushTime);
      
      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: { service: "api" },
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        type: MetricType.GAUGE,
        name: "test.gauge",
        value: 100,
        tags: { region: "us-east-1" },
        timestamp: 2000,
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(2);
      
      expect(payloads).toContainEqual({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: { service: "api" },
        timestamp: mockFlushTime,
      });
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.gauge",
        value: 100,
        tags: { region: "us-east-1" },
        timestamp: mockFlushTime,
      });
    });

    it("should export histogram percentiles as gauge metrics", () => {
      const mockFlushTime = 5000;
      vi.setSystemTime(mockFlushTime);
      
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: 1000,
        options: {
          percentiles: [0.5, 0.95],
        },
      });

      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 200,
        tags: { endpoint: "/api" },
        timestamp: 2000,
        options: {
          percentiles: [0.5, 0.95],
        },
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(2);
      
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.p50",
        value: 100, // 50th percentile of [100, 200]
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.p95",
        value: 200, // 95th percentile of [100, 200]
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });
    });

    it("should export histogram aggregates as appropriate metric types", () => {
      const mockFlushTime = 5000;
      vi.setSystemTime(mockFlushTime);
      
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: 1000,
        options: {
          aggregates: ["count", "max", "min", "avg"] as HistogramAggregates[],
        },
      });

      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 200,
        tags: { endpoint: "/api" },
        timestamp: 2000,
        options: {
          aggregates: ["count", "max", "min", "avg"] as HistogramAggregates[],
        },
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(4);

      // Count should be COUNT type
      expect(payloads).toContainEqual({
        type: MetricType.COUNT,
        name: "test.histogram.count",
        value: 2,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });

      // Other aggregates should be GAUGE type
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.max",
        value: 200,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });

      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.min",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });

      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.avg",
        value: 150,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });
    });

    it("should handle histogram with both percentiles and aggregates", () => {
      const mockFlushTime = 5000;
      vi.setSystemTime(mockFlushTime);
      
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: 1000,
        options: {
          percentiles: [0.5],
          aggregates: ["count"] as HistogramAggregates[],
        },
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(2);
      
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.histogram.p50",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });
      expect(payloads).toContainEqual({
        type: MetricType.COUNT,
        name: "test.histogram.count",
        value: 1,
        tags: { endpoint: "/api" },
        timestamp: mockFlushTime,
      });
    });

    it("should handle histogram with no percentiles or aggregates", () => {
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        options: {},
        tags: { endpoint: "/api" },
        timestamp: 1000,
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(0);
    });
  });

  describe("tag serialization", () => {
    it("should treat metrics with same tags in different order as same metric", () => {
      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: { service: "api", region: "us-east-1" },
        timestamp: 1000,
      });

      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 3,
        tags: { region: "us-east-1", service: "api" },
        timestamp: 2000,
      });

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0].value).toBe(8);
    });

    it("should handle empty tags", () => {
      metricsDb.storeMetric({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: {},
        timestamp: 1000,
      });

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0].tags).toEqual({});
    });
  });
});
