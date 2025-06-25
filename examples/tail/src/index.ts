import { env } from 'cloudflare:workers';
import {
	DatadogMetricSink,
	TailExporter,
	WorkersAnalyticsEngineSink,
	OtelMetricSink,
	OtelLogSink,
} from '@flarelabs-net/workers-observability-utils/tail';

export default new TailExporter({
	metrics: {
		sinks: [
			new DatadogMetricSink({
				site: 'us3.datadoghq.com',
			}),
			new OtelMetricSink({
				url: 'https://api.honeycomb.io',
				headers: {
					'x-honeycomb-team': env.HONEYCOMB_API_KEY,
					'x-honeycomb-dataset': 'metrics',
				},
			}),
			new WorkersAnalyticsEngineSink({
				datasetBinding: env.METRICS_DATASET,
			}),
		],
		maxBufferSize: 10,
		maxBufferDuration: 1,
	},
	logs: {
		sinks: [
			new OtelLogSink({
				url: 'https://api.honeycomb.io',
				headers: {
					'x-honeycomb-team': env.HONEYCOMB_API_KEY,
					'x-honeycomb-dataset': 'metrics',
				},
			}),
		],
	},
});
