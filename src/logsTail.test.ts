import { describe, it, expect } from "vitest";
import { LogsTail } from "./logsTail";
import type { LogSink } from "./sinks/sink";
import type { TraceItem } from "@cloudflare/workers-types";

class TestLogSink implements LogSink {
  receivedLogs: TraceItem[] = [];

  async sendLogs(traceItems: TraceItem[]): Promise<void> {
    this.receivedLogs.push(...traceItems);
  }

  clear() {
    this.receivedLogs = [];
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

describe("LogsTail", () => {
  it("should process trace items and send to sink", async () => {
    const testSink = new TestLogSink();
    const logsTail = new LogsTail({
      sinks: [testSink],
      maxBufferSize: 1, // Force immediate flush
    });

    const mockTraceItems: TraceItem[] = [
      {
        scriptName: "test-worker",
        executionModel: "isolate",
        outcome: "ok",
        cpuTime: 150,
        wallTime: 200,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [
          {
            level: "info",
            message: ["Test log message"],
            timestamp: Date.now(),
          },
        ],
        exceptions: [],
        scriptVersion: { id: "v1" },
      } as TraceItem,
    ];

    const mockCtx = new MockExecutionContext();

    logsTail.processTraceItems(mockTraceItems, mockCtx);

    await mockCtx.waitForAll();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(testSink.receivedLogs).toHaveLength(1);
    expect(testSink.receivedLogs[0]).toMatchObject({
      scriptName: "test-worker",
      executionModel: "isolate",
      outcome: "ok",
      cpuTime: 150,
      wallTime: 200,
    });
    expect(testSink.receivedLogs[0].logs).toHaveLength(1);
    expect(testSink.receivedLogs[0].logs[0]).toMatchObject({
      level: "info",
      message: ["Test log message"],
    });
  });

  it("should flush when buffer size is reached", async () => {
    const testSink = new TestLogSink();
    const logsTail = new LogsTail({
      sinks: [testSink],
      maxBufferSize: 2,
    });

    const mockTraceItems: TraceItem[] = [
      {
        scriptName: "worker-1",
        executionModel: "isolate",
        outcome: "ok",
        cpuTime: 100,
        wallTime: 150,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [{ level: "info", message: ["Log 1"], timestamp: Date.now() }],
        exceptions: [],
        scriptVersion: { id: "v1" },
      } as TraceItem,
      {
        scriptName: "worker-2",
        executionModel: "isolate",
        outcome: "ok",
        cpuTime: 200,
        wallTime: 250,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [{ level: "error", message: ["Log 2"], timestamp: Date.now() }],
        exceptions: [],
        scriptVersion: { id: "v2" },
      } as TraceItem,
    ];

    const mockCtx = new MockExecutionContext();

    // Add 2 trace items at once - should trigger flush
    logsTail.processTraceItems(mockTraceItems, mockCtx);
    await mockCtx.waitForAll();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(testSink.receivedLogs).toHaveLength(2);
    expect(testSink.receivedLogs[0].scriptName).toBe("worker-1");
    expect(testSink.receivedLogs[1].scriptName).toBe("worker-2");
  });

  it("should handle empty trace items arrays", async () => {
    const testSink = new TestLogSink();
    const logsTail = new LogsTail({
      sinks: [testSink],
      maxBufferSize: 1,
    });

    const mockCtx = new MockExecutionContext();

    logsTail.processTraceItems([], mockCtx);
    await mockCtx.waitForAll();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(testSink.receivedLogs).toHaveLength(0);
  });

  it("should handle multiple sinks", async () => {
    const testSink1 = new TestLogSink();
    const testSink2 = new TestLogSink();
    const logsTail = new LogsTail({
      sinks: [testSink1, testSink2],
      maxBufferSize: 1,
    });

    const mockTraceItem: TraceItem = {
      scriptName: "test-worker",
      executionModel: "isolate",
      outcome: "ok",
      cpuTime: 100,
      wallTime: 150,
      eventTimestamp: Date.now(),
      event: {},
      truncated: false,
      diagnosticsChannelEvents: [],
      logs: [{ level: "info", message: ["Test message"], timestamp: Date.now() }],
      exceptions: [],
      scriptVersion: { id: "v1" },
    } as TraceItem;

    const mockCtx = new MockExecutionContext();

    logsTail.processTraceItems([mockTraceItem], mockCtx);
    await mockCtx.waitForAll();
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(testSink1.receivedLogs).toHaveLength(1);
    expect(testSink2.receivedLogs).toHaveLength(1);
    expect(testSink1.receivedLogs[0]).toMatchObject({
      scriptName: "test-worker",
      outcome: "ok",
    });
    expect(testSink2.receivedLogs[0]).toMatchObject({
      scriptName: "test-worker",
      outcome: "ok",
    });
  });
});