import type { ExportedMetricPayload } from "../../types";
import type { MetricSink } from "../sink";

export interface WAEMetricSinkOptions {
  /**
   * Analytics Engine dataset binding
   */
  datasetBinding: AnalyticsEngineDataset;
}

/**
 * A sink that sends metrics to Cloudflare Workers Analytics Engine
 */
export class WorkersAnalyticsEngineSink implements MetricSink {
  private readonly options: WAEMetricSinkOptions;
  constructor(options: WAEMetricSinkOptions) {
    this.options = options;
  }

  /**
   * Send multiple metrics to Workers Analytics Engine
   */
  async sendMetrics(payloads: ExportedMetricPayload[]): Promise<void> {
    if (!payloads || payloads.length === 0) {
      return;
    }
    
    try {
      for (const payload of payloads) {
        await this.sendMetric(payload);
      }
    } catch (error) {
      throw new Error(`Failed to send metrics to Workers Analytics Engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async sendMetric(payload: ExportedMetricPayload): Promise<void> {
    const dataset = this.options.datasetBinding;
    if (!dataset) {
      throw new Error("Dataset binding not found");
    }

    const { blobs, doubles, index } = this.transformMetric(payload);

    try {
      dataset.writeDataPoint({
        blobs: blobs.slice(0, 20),
        doubles: doubles.slice(0, 20),
        indexes: index,
      });
    } catch (error) {
      throw new Error(`Failed to write datapoint to Analytics Engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private transformMetric(payload: ExportedMetricPayload): {
    blobs: string[];
    doubles: number[];
    index: [string];
  } {
    const {
      scriptName,
      executionModel,
      outcome,
      versionId,
      trigger,
      ...customTags
    } = payload.tags;

    const blobs: string[] = [];
    const doubles: number[] = [];

    // First blob is always the metric type
    blobs.push(payload.type);

    // Add doubles
    doubles.push(payload.timestamp);
    doubles.push(payload.value);

    // Add special tags in a fixed order
    blobs.push(`${scriptName || ""}`);
    blobs.push(`${executionModel || ""}`);
    blobs.push(`${outcome || ""}`);
    blobs.push(`${versionId || ""}`);
    blobs.push(`${trigger || ""}`);

    // Reserve positions for future global tags
    blobs.push("");
    blobs.push("");
    blobs.push("");
    blobs.push("");

    // Add custom tags starting from position 11
    for (const value of Object.values(customTags)) {
      blobs.push(`${value || ""}`);
    }

    return {
      blobs,
      doubles,
      index: [`${payload.name}#${scriptName}`.slice(0, 96)],
    };
  }
}
