import type {
  TraceItem,
  TraceItemTailEventInfo,
} from "@cloudflare/workers-types";

import {
  type KeyValue,
  type LogRecord,
  type OTLPLogsPayload,
  type ResourceLogs,
  type ScopeLogs,
  SeverityNumber,
} from "./otel-logs-types";
import { ulidFactory } from "ulid-workers";
import type { LogSink } from "../sink";
import { flatten } from "flat";
export interface OtelLogSinkOptions {
  url: string;
  headers: Record<string, string>;
  scopeName?: string;
  scopeVersion?: string;
  defaultLogsEnabled: {
    invocationLog: boolean;
  };
}

const ulid = ulidFactory();

export class OtelLogSink implements LogSink {
  private options: OtelLogSinkOptions & {
    scopeName: string;
    scopeVersion: string;
  };

  constructor(options: OtelLogSinkOptions) {
    this.options = {
      scopeName: "workers-observability-utils",
      scopeVersion: "0.3.0",
      ...options,
      defaultLogsEnabled: {
        invocationLog: options.defaultLogsEnabled?.invocationLog !== false,
      }
    };
  }

  async sendLogs(traceItems: TraceItem[]): Promise<void> {
    if (!traceItems || traceItems.length === 0) {
      return;
    }

    try {
      // Transform to OTLP format
      const otlpPayload = this.buildOTLPPayload(traceItems);

      // Send via fetch
      await this.exportLogs(otlpPayload);
    } catch (error) {
      throw new Error(
        `Failed to send logs to OTEL collector: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private buildOTLPPayload(traceItems: TraceItem[]): OTLPLogsPayload {
    const resourceLogs: ResourceLogs[] = traceItems.map((event) => {
      const requestId =
        (event.event as TraceItemFetchEventInfo)?.request?.headers?.[
          "cf-ray"
        ] || ulid();

      // Extract resource attributes
      const resourceAttributes = this.convertTagsToAttributes({
        "cloud.provider": "Cloudflare",
        "cloud.service":
          event.executionModel === "stateless" ? "Workers" : "Durable Objects",
        "cloud.region": "earth",
        "faas.name": event.scriptName,
        "service.name": event.scriptName,
        "faas.trigger": this.mapEventTypeToTrigger(event.event),
        "faas.version": event.scriptVersion?.id || "unknown",
      });

      const logRecords: LogRecord[] = [];

      if (this.options.defaultLogsEnabled.invocationLog) {
        // Add invocation log
        const invocationLog: LogRecord = {
          timeUnixNano: this.timestampToNanos(event.eventTimestamp || Date.now()),
          severityNumber: SeverityNumber.SEVERITY_NUMBER_INFO,
          severityText: "INFO",
          body: {
            stringValue: this.eventToMessage(event),
          },
          attributes: this.convertTagsToAttributes({
            ...flatten({ event: event.event }),
            cpuTimeMs: event.cpuTime || 0,
            wallTimeMs: event.wallTime || 0,
            scriptVersion: event.scriptVersion?.id || "unknown",
            scriptName: event.scriptName || "unknown",
            executionModel: event.executionModel || "unknown",
            outcome: event.outcome,
            entrypoint: event.entrypoint || "default",
            request_id: requestId,
            log_type: "invocation",
          }),
        };
        logRecords.push(invocationLog);
      }

      // Add individual logs
      if (event.logs) {
        for (const log of event.logs) {
          const { message, attributes } = this.messageArrayToStructuredLog(
            log.message
          );
          const logRecord: LogRecord = {
            timeUnixNano: this.timestampToNanos(log.timestamp),
            severityNumber: this.mapLogLevelToSeverity(log.level),
            severityText: log.level?.toUpperCase(),
            body: {
              stringValue: message,
            },
            attributes: this.convertTagsToAttributes({
              ...flatten(attributes),
              cpuTimeMs: event.cpuTime || 0,
              wallTimeMs: event.wallTime || 0,
              scriptVersion: event.scriptVersion?.id || "unknown",
              scriptName: event.scriptName || "unknown",
              executionModel: event.executionModel || "unknown",
              outcome: event.outcome,
              entrypoint: event.entrypoint || "default",
              request_id: requestId,
            }),
          };
          logRecords.push(logRecord);
        }
      }

      // Add exceptions
      if (event.exceptions) {
        for (const exception of event.exceptions) {
          const exceptionRecord: LogRecord = {
            timeUnixNano: this.timestampToNanos(exception.timestamp),
            severityNumber: SeverityNumber.SEVERITY_NUMBER_FATAL,
            severityText: "FATAL",
            body: {
              stringValue: exception.message,
            },
            attributes: this.convertTagsToAttributes({
              ...flatten(exception),
              cpuTimeMs: event.cpuTime || 0,
              wallTimeMs: event.wallTime || 0,
              scriptVersion: event.scriptVersion?.id || "unknown",
              scriptName: event.scriptName || "unknown",
              executionModel: event.executionModel || "unknown",
              outcome: event.outcome,
              entrypoint: event.entrypoint || "default",
              request_id: requestId,
            }),
          };
          logRecords.push(exceptionRecord);
        }
      }

      const scopeLogs: ScopeLogs = {
        scope: {
          name: this.options.scopeName,
          version: this.options.scopeVersion,
        },
        logRecords,
      };

      return {
        resource: {
          attributes: resourceAttributes,
        },
        scopeLogs: [scopeLogs],
      };
    });

    return {
      resourceLogs,
    };
  }

  private async exportLogs(payload: OTLPLogsPayload): Promise<void> {
    const url = this.options.url.endsWith("/v1/logs")
      ? this.options.url
      : `${this.options.url}/v1/logs`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.options.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${errorText}`
      );
    }
  }

  private convertTagsToAttributes(
    tags?: Record<string, string | number | boolean | undefined | null>
  ): KeyValue[] {
    return Object.entries(tags || {})
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({
        key,
        value: {
          stringValue: String(value),
        },
      }));
  }

  private timestampToNanos(timestampMs: number): string {
    // Convert milliseconds to nanoseconds using BigInt to avoid precision loss
    return String(BigInt(Math.round(timestampMs)) * BigInt(1000000));
  }

  private mapLogLevelToSeverity(level?: string): SeverityNumber {
    if (!level) return SeverityNumber.SEVERITY_NUMBER_INFO;

    switch (level.toLowerCase()) {
      case "trace":
        return SeverityNumber.SEVERITY_NUMBER_TRACE;
      case "debug":
        return SeverityNumber.SEVERITY_NUMBER_DEBUG;
      case "info":
        return SeverityNumber.SEVERITY_NUMBER_INFO;
      case "warn":
      case "warning":
        return SeverityNumber.SEVERITY_NUMBER_WARN;
      case "error":
        return SeverityNumber.SEVERITY_NUMBER_ERROR;
      case "fatal":
        return SeverityNumber.SEVERITY_NUMBER_FATAL;
      default:
        return SeverityNumber.SEVERITY_NUMBER_INFO;
    }
  }

  private mapEventTypeToTrigger(event: TraceItem["event"]): string {
    if (!event) {
      return "other";
    }
    // Map Cloudflare Worker event types to OpenTelemetry trigger types
    if ("request" in event) return "http";
    if ("scheduled" in event) return "timer";
    if ("queue" in event) return "pubsub";
    if ("websocket" in event) return "websocket";
    if ("cron" in event) return "cron";
    if ("rpcMethod" in event) return "jsrpc";
    if ("mailFrom" in event) return "email";
    return "other";
  }

  private eventToMessage(event: TraceItem): string {
    // Create a human-readable message from the event
    const worker = event.scriptName || "unknown";
    const outcome = event.outcome || "unknown";

    return `Invoked worker ${worker} via ${this.mapEventTypeToTrigger(
      event.event
    )} with outcome ${outcome}`;
  }

  private messageArrayToStructuredLog(input: unknown[]): {
    message: string;
    attributes: Record<string, unknown>;
  } {
    let message = "";
    let attributes: Record<string, unknown> = {};
    for (const part of input) {
      if (typeof part === "string" || typeof part === "number") {
        message = message ? `${message} ${part}` : `${part}`;
      } else if (typeof part === "object" && part !== null) {
        attributes = { ...attributes, ...part };
      }
    }

    return {
      message,
      attributes,
    };
  }
}
