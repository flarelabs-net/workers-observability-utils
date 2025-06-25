import { describe, it, expect } from "vitest";
import { MetricsTail } from "./metricsTail";
import type { MetricSink } from "./sinks/sink";
import type { MetricPayload } from "./types";
import { MetricType, METRICS_CHANNEL_NAME } from "./types";
import type { TraceItem } from "@cloudflare/workers-types";

class TestSink implements MetricSink {
  receivedMetrics: MetricPayload[] = [];

  async sendMetrics(metrics: MetricPayload[]): Promise<void> {
    this.receivedMetrics.push(...metrics);
  }

  clear() {
    this.receivedMetrics = [];
  }
}

class MockExecutionContext implements ExecutionContext {
  #promises: Promise<unknown>[] = [];
  props = {};

  waitUntil(promise: Promise<unknown>): void {
    this.#promises.push(promise);
  }

  passThroughOnException(): void {}

  async waitForAll(): Promise<void> {
    await Promise.allSettled(this.#promises);
  }
}

describe("MetricsTail", () => {
  it("should process trace items with metrics and send to sink", async () => {
    const testSink = new TestSink();
    const metricsTail = new MetricsTail({
      sinks: [testSink],
      maxBufferSize: 1,
    });

    const mockTraceItem = {
      scriptName: "test-worker",
      executionModel: "isolate",
      outcome: "ok",
      cpuTime: 150,
      wallTime: 200,
      eventTimestamp: Date.now(),
      event: {},
      truncated: false,
      diagnosticsChannelEvents: [
        {
          channel: METRICS_CHANNEL_NAME,
          timestamp: Date.now(),
          message: {
            type: MetricType.COUNT,
            name: "test.counter",
            value: 1,
            tags: { environment: "test" },
          },
        },
      ],
      logs: [],
      exceptions: [],
      scriptVersion: { id: "v1" },
    } as TraceItem;

    const mockCtx = new MockExecutionContext();

    metricsTail.processTraceItems([mockTraceItem], mockCtx);

    await mockCtx.waitForAll();

    expect(testSink.receivedMetrics.length).toBeGreaterThan(0);

    const userMetric = testSink.receivedMetrics.find(m => m.name === "test.counter");
    expect(userMetric).toBeDefined();
    expect(userMetric?.tags).toMatchObject({
      environment: "test",
      scriptName: "test-worker",
      executionModel: "isolate",
      outcome: "ok",
      versionId: "v1",
    });

    const defaultMetrics = testSink.receivedMetrics.filter(m => 
      m.name.startsWith("worker.")
    );
    expect(defaultMetrics.length).toBeGreaterThan(0);
  });

  it("should handle invalid metric payloads gracefully", async () => {
    const testSink = new TestSink();
    const metricsTail = new MetricsTail({
      sinks: [testSink],
      maxBufferSize: 1,
    });

    const mockTraceItem = {
      scriptName: "test-worker",
      executionModel: "isolate",
      outcome: "ok",
      cpuTime: 100,
      wallTime: 150,
      eventTimestamp: Date.now(),
      event: {},
      truncated: false,
      diagnosticsChannelEvents: [
        {
          channel: METRICS_CHANNEL_NAME,
          timestamp: Date.now(),
          message: {
            type: "INVALID_TYPE",
            name: "invalid.metric",
            value: "not-a-number",
            tags: { test: true },
          },
        },
      ],
      logs: [],
      exceptions: [],
      scriptVersion: { id: "v1" },
    } as TraceItem;

    const mockCtx = new MockExecutionContext();

    metricsTail.processTraceItems([mockTraceItem], mockCtx);
    await mockCtx.waitForAll();

    const userMetrics = testSink.receivedMetrics.filter(m => m.name === "invalid.metric");
    expect(userMetrics).toHaveLength(0);
    
    expect(testSink.receivedMetrics.length).toBeGreaterThan(0);
  });
});