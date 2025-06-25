import type { TraceItem } from "@cloudflare/workers-types";
import type { LogSink } from "./sinks/sink";
import { TraceItemDb } from "./traceItem";

export interface LogTailOptions {
  sinks: LogSink[];
  /**
   * Max number of trace items to buffer before flushing.
   * Default: 25
   */
  maxBufferSize?: number;
  /**
   * Max duration in Seconds to buffer before flushing.
   * Default: 5 Seconds
   */
  maxBufferDuration?: number;
}

export class LogsTail {
  #logSinks: LogSink[];
  #maxBufferSize: number;
  #maxBufferDuration: number;
  #flushId = 0;
  #traceItems = new TraceItemDb();
  #flushScheduled = false;

  constructor(options: LogTailOptions) {
    this.#logSinks = options.sinks;
    this.#maxBufferSize = options.maxBufferSize || 25;
    this.#maxBufferDuration = Math.min(options.maxBufferDuration || 5, 30);
  }

  processTraceItems(traceItems: TraceItem[], ctx: ExecutionContext): void {
    // Store all trace items in the buffer
    this.#traceItems.storeTraceItems(traceItems);

    // Check if we need to flush immediately due to buffer size
    if (this.#traceItems.getTraceItems().length >= this.#maxBufferSize) {
      if (this.#flushScheduled) {
        this.#flushScheduled = false;
      }

      this.#flushId++;
      // Flush immediately
      ctx.waitUntil(this.#performFlush());
      return;
    }

    if (this.#flushScheduled) {
      return;
    }

    // Only schedule flush if there are trace items to flush
    if (this.#traceItems.getTraceItems().length > 0) {
      this.#flushScheduled = true;
      const scheduleFlush = async () => {
        try {
          const localFlushId = ++this.#flushId;
          await scheduler.wait(this.#maxBufferDuration * 1000);

          if (localFlushId === this.#flushId) {
            await this.#performFlush();
          }
        } catch (error) {}
      };

      ctx.waitUntil(scheduleFlush());
    }
  }

  async #performFlush(): Promise<void> {
    const items = this.#traceItems.getTraceItems();

    // Reset batch and flush state
    this.#flushScheduled = false;
    this.#traceItems.clear();

    // Skip if no items to flush
    if (items.length === 0) {
      return;
    }

    try {
      const results = await Promise.allSettled(
        this.#logSinks.map((sink) => sink.sendLogs(items)),
      );
      const successfulSinks = results.filter((el) => el.status === "fulfilled") as PromiseFulfilledResult<void>[];
      if (successfulSinks.length > 0) {
        console.debug(`Flushed ${items.length} logs to ${successfulSinks.length} sink(s) successfully.`, {
          logs: items.length,
          sinks: successfulSinks.length,
        });
      }
      const errors = results.filter((el) => el.status === "rejected") as PromiseRejectedResult[];
      if (errors.length > 0) {
        const sinkErrors = errors.map((error) => {
          return `${error.reason instanceof Error ? error.reason.message : String(error.reason)}`;
        });
        console.error(`Failed to flush logs to ${errors.length} sink(s): ${sinkErrors.join(', ')}`, {
          logs: items.length,
          sinks: errors.length,
          errors: sinkErrors,
        });
      }
    } catch (error) {
      console.error("Error flushing logs batch:", error);
    }
  }
}