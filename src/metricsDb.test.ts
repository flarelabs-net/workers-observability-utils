import { describe, it, expect, beforeEach } from "vitest";
import { MetricsDb } from "./metricsDb";
import {
  type EmittedMetricPayload,
  MetricType,
} from "./types";

describe("MetricsDb", () => {
  let metricsDb: MetricsDb;

  beforeEach(() => {
    metricsDb = new MetricsDb();
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
      const metric: EmittedMetricPayload = {
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 150,
        tags: { endpoint: "/api/users" },
        timestamp: Date.now(),
      };

      metricsDb.storeMetric(metric);

      expect(metricsDb.getMetricCount()).toBe(1);
      const metrics = metricsDb.getAllMetrics();
      expect(metrics[0]).toEqual({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: [{ value: 150, time: metric.timestamp }],
        tags: { endpoint: "/api/users" },
        lastUpdated: metric.timestamp,
      });
    });

    it("should accumulate histogram values with same key", () => {
      const baseMetric = {
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        tags: { endpoint: "/api/users" },
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
      expect(metrics[0].value).toEqual([{ value: 100, time: 1000 }, { value: 200, time: 2000 }]);
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
    it("should export count and gauge metrics unchanged", () => {
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
        timestamp: 1000,
      });
      expect(payloads).toContainEqual({
        type: MetricType.GAUGE,
        name: "test.gauge",
        value: 100,
        tags: { region: "us-east-1" },
        timestamp: 2000,
      });
    });

    it("should export histogram percentiles as gauge metrics", () => {
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: 1000
      });

      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 200,
        tags: { endpoint: "/api" },
        timestamp: 2000
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toEqual({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: [{
          value: 100,
          time: 1000,
        }, {
          value: 200,
          time: 2000,
        }],
        tags: { endpoint: "/api" },
      });
    });

    it("should handle histogram with no percentiles or aggregates", () => {
      metricsDb.storeMetric({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 100,
        tags: { endpoint: "/api" },
        timestamp: 1000,
      });

      const payloads = metricsDb.toMetricPayloads();

      expect(payloads).toHaveLength(1);
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
