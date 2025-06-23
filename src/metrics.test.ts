import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { metrics } from "./index";
import {
  MetricType,
  METRICS_CHANNEL_NAME,
  MetricPayload,
  HistogramOptions,
} from "./types";

describe("metrics", () => {
  let receivedMessages: MetricPayload[] = [];
  const subscriber = (message: unknown) => {
    receivedMessages.push(message as MetricPayload);
  };

  beforeAll(() => {
    subscribe(METRICS_CHANNEL_NAME, subscriber);
  });

  beforeEach(() => {
    receivedMessages = [];
  });

  afterAll(() => {
    unsubscribe(METRICS_CHANNEL_NAME, subscriber);
  });

  describe("count", () => {
    it("should publish count metric with custom value and tags", () => {
      metrics.count("test.counter", 5, { service: "api", version: 1 });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: MetricType.COUNT,
        name: "test.counter",
        value: 5,
        tags: { service: "api", version: 1 },
      });
    });
  });

  describe("gauge", () => {
    it("should publish gauge metric with tags", () => {
      metrics.gauge("test.gauge", 100, { region: "us-east-1", active: true });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: MetricType.GAUGE,
        name: "test.gauge",
        value: 100,
        tags: { region: "us-east-1", active: true },
      });
    });
  });

  describe("histogram", () => {
    it("should publish histogram metric with options and tags", () => {
      const options = {
        aggregates: ["max", "min", "avg"] as HistogramOptions["aggregates"],
        percentiles: [0.5, 0.95, 0.99],
      };

      metrics.histogram("test.histogram", 150, options, { endpoint: "/api/users" });

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: MetricType.HISTOGRAM,
        name: "test.histogram",
        value: 150,
        tags: { endpoint: "/api/users" },
        options,
      });
    });
  });
});
