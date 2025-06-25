import { describe, it, expect, beforeEach } from "vitest";
import { TraceItemDb } from "./traceItem";
import type { TraceItem } from "@cloudflare/workers-types";

describe("TraceItemDb", () => {
  let traceItemDb: TraceItemDb;

  beforeEach(() => {
    traceItemDb = new TraceItemDb();
  });

  it("should store and retrieve trace items", () => {
    const mockTraceItems: TraceItem[] = [
      {
        scriptName: "test-worker-1",
        executionModel: "isolate",
        outcome: "ok",
        cpuTime: 100,
        wallTime: 150,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [],
        exceptions: [],
      } as TraceItem,
      {
        scriptName: "test-worker-2",
        executionModel: "isolate",
        outcome: "exception",
        cpuTime: 200,
        wallTime: 250,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [],
        exceptions: [],
      } as TraceItem,
    ];

    traceItemDb.storeTraceItems(mockTraceItems);

    const retrievedItems = traceItemDb.getTraceItems();
    expect(retrievedItems).toHaveLength(2);
    expect(retrievedItems[0]).toMatchObject({
      scriptName: "test-worker-1",
      executionModel: "isolate",
      outcome: "ok",
      cpuTime: 100,
      wallTime: 150,
    });
    expect(retrievedItems[1]).toMatchObject({
      scriptName: "test-worker-2",
      executionModel: "isolate",
      outcome: "exception",
      cpuTime: 200,
      wallTime: 250,
    });
  });

  it("should append trace items when called multiple times", () => {
    const firstBatch: TraceItem[] = [
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
        logs: [],
        exceptions: [],
      } as TraceItem,
    ];

    const secondBatch: TraceItem[] = [
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
        logs: [],
        exceptions: [],
      } as TraceItem,
    ];

    traceItemDb.storeTraceItems(firstBatch);
    traceItemDb.storeTraceItems(secondBatch);

    const allItems = traceItemDb.getTraceItems();
    expect(allItems).toHaveLength(2);
    expect(allItems[0].scriptName).toBe("worker-1");
    expect(allItems[1].scriptName).toBe("worker-2");
  });

  it("should clear all trace items", () => {
    const mockTraceItems: TraceItem[] = [
      {
        scriptName: "test-worker",
        executionModel: "isolate",
        outcome: "ok",
        cpuTime: 100,
        wallTime: 150,
        eventTimestamp: Date.now(),
        event: {},
        truncated: false,
        diagnosticsChannelEvents: [],
        logs: [],
        exceptions: [],
      } as TraceItem,
    ];

    traceItemDb.storeTraceItems(mockTraceItems);
    expect(traceItemDb.getTraceItems()).toHaveLength(1);

    traceItemDb.clear();
    expect(traceItemDb.getTraceItems()).toHaveLength(0);
  });

  it("should handle empty arrays", () => {
    traceItemDb.storeTraceItems([]);
    expect(traceItemDb.getTraceItems()).toHaveLength(0);
  });
});