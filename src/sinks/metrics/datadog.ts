import { MetricType, type ExportedMetricPayload, type Tags } from "../../types";
import { env } from "cloudflare:workers";
import type { MetricSink } from "../sink";

const DISTRIBUTION_POINTS_ENDPOINT_PATH: string = "api/v1/distribution_points";
const METRICS_SERIES_ENDPOINT_PATH: string = "api/v1/series";

export interface DatadogMetricSinkOptions {
  /**
   * Datadog API key
   */
  apiKey?: string;

  /**
   * Datadog site (default: 'datadoghq.com')
   */
  site?: string;

  /**
   * Custom distribution points endpoint URL override (for testing or proxies)
   */
  distributionPointsEndpoint?: string;

  /**
   * Custom metrics series endpoint URL override (for testing or proxies)
   */
  metricsSeriesEndpoint?: string;
}

/**
 * A sink that sends metrics to Datadog
 */
export class DatadogMetricSink implements MetricSink {
  private readonly options: {
    apiKey: string;
    site: string;
    distributionPointsEndpoint: string;
    metricsSeriesEndpoint: string;
  };

  constructor(options?: DatadogMetricSinkOptions) {
    // @ts-ignore
    const apiKey = options?.apiKey || env.DD_API_KEY || env.DATADOG_API_KEY;
    if (!apiKey || apiKey.length === 0) {
      console.error(
        "Datadog API key was not found. Provide it in the sink options or set the DD_API_KEY environment variable. Metrics will not be sent to Datadog."
      );
    }

    // @ts-ignore
    const site = options?.site || env.DD_SITE || "datadoghq.com";
    const distributionPointsEndpoint =
      options?.distributionPointsEndpoint ||
      `https://api.${site}/${DISTRIBUTION_POINTS_ENDPOINT_PATH}`;
    const metricsSeriesEndpoint =
      options?.metricsSeriesEndpoint ||
      `https://api.${site}/${METRICS_SERIES_ENDPOINT_PATH}`;

    this.options = {
      apiKey,
      site,
      distributionPointsEndpoint,
      metricsSeriesEndpoint,
    };
  }

  /**
   * Send multiple metrics to Datadog
   */
  async sendMetrics(payloads: ExportedMetricPayload[]): Promise<void> {
    if (!payloads || payloads.length === 0) {
      return;
    }

    try {
      // Filter out worker metrics, since Datadog is currently getting this metrics through an integration
      // For now, Datadog only accepts custom metrics.
      const payloadsWithoutWorkerMetrics = payloads.filter(
        (payload) => !payload.name.startsWith("worker.")
      );

      const datadogMetrics = payloadsWithoutWorkerMetrics.map((payload) =>
        this.transformMetric(payload)
      );

      await this.sendToDatadog(datadogMetrics);
    } catch (error) {
      throw new Error(
        `Failed to send metrics to Datadog: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Transform a metric payload to Datadog format
   */
  private transformMetric(payload: ExportedMetricPayload): DatadogMetric {
    const tags = this.formatTags(payload.tags);

    const metricType = payload.type;

    if (metricType === MetricType.HISTOGRAM) {
      return {
        metric: payload.name,
        type: "distribution",
        points: payload.value.map((value) => [
          Math.floor(value.time / 1000),
          [value.value],
        ]),
        tags: tags,
      };
    }
    return {
      metric: payload.name,
      type: metricType.toLowerCase(),
      points: [[Math.floor(payload.timestamp / 1000), payload.value]],
      tags: tags,
    };
  }

  /**
   * Format tags returns a list of tags in the format `key:value`,
   * and adds the following tags:
   * - `worker_script:${scriptName}`
   * - `execution_model:${executionModel}`
   * - `version:${versionId}`
   * - `trigger:${trigger}`
   * - `region:earth`
   */
  private formatTags(tags: Tags): string[] {
    const { scriptName, executionModel, versionId, trigger, ...customTags } =
      tags;

    const formattedTags = Object.entries(customTags)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}:${value}`);

    if (scriptName != null) {
      formattedTags.push(`worker_script:${scriptName}`);
    }

    if (executionModel != null) {
      formattedTags.push(`execution_model:${executionModel}`);
    }

    if (versionId != null) {
      formattedTags.push(`version:${versionId}`);
    }

    if (trigger != null) {
      formattedTags.push(`trigger:${trigger}`);
    }

    formattedTags.push("region:earth");

    return formattedTags;
  }

  /**
   * Send metrics to Datadog API
   */
  private async sendToDatadog(metrics: DatadogMetric[]): Promise<void> {
    if (!this.options.apiKey || this.options.apiKey.length === 0) {
      console.warn(
        `Datadog API key was not found. Dropping ${metrics.length} metrics.`
      );
      return;
    }

    const distributionMetrics: DatadogMetric[] = metrics.filter(
      (metric) => metric.type === "histogram"
    );
    // Other metrics are sent as metrics series
    const otherMetrics: DatadogMetric[] = metrics.filter(
      (metric) => metric.type !== "histogram"
    );

    const promises = [
      distributionMetrics.length > 0 &&
        this.sendDistributionMetrics(distributionMetrics),
      otherMetrics.length > 0 && this.sendMetricsSeries(otherMetrics),
    ].filter(Boolean);

    if (promises.length === 0) {
      return;
    }

    try {
      await Promise.all(promises);
    } catch (error) {
      throw new Error(
        `Failed to send metrics to Datadog: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async sendMetricsSeries(metrics: DatadogMetric[]): Promise<void> {
    this.postRequest(
      this.options.metricsSeriesEndpoint,
      JSON.stringify({ series: metrics })
    );
  }

  private async sendDistributionMetrics(
    metrics: DatadogMetric[]
  ): Promise<void> {
    await this.postRequest(
      this.options.distributionPointsEndpoint,
      JSON.stringify({ series: metrics })
    );
  }

  private async postRequest(endpoint: string, body: string): Promise<void> {
    console.log(body);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": this.options.apiKey,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Datadog API error (${response.status}): ${text}`);
    }
  }
}

type DatadogPoint = [number, number[]] | [number, number]; // [timestamp, [values]] (distribution) or [timestamp, value] (count, histogram, gauge)

interface DatadogMetric {
  metric: string;
  type: string;
  points: DatadogPoint[];
  tags: string[];
}
