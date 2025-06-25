import { metrics } from 'workers-observability-utils';

export interface Env {
	// Datadog API keys
	DD_API_KEY?: string;
	DATADOG_API_KEY?: string;
	DD_SITE?: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.info(`Incoming ${request.method} request to ${request.url}`);
		console.warn(`Processing request at ${new Date().toISOString()}`);
		console.error(`Error processing request at ${new Date().toISOString()}`);

		console.debug("Structured logging supported", {
			requestMethod: request.method,
			requestUrl: request.url,
			// Add any other structured fields you want
		})
		// Record request count metric with HTTP method tag
		metrics.count('worker.request', 1, {
			method: request.method,
		});

		// Record request content length if it exists
		const contentLength = request.headers.get('content-length');
		if (contentLength) {
			metrics.gauge('worker.request.content_length', Number.parseInt(contentLength, 10));
		}

		// Start timing the request
		const requestStart = Date.now();

		// Process the request
		let response: Response = new Response();
		try {
			// Record attempts metric
			metrics.histogram('worker.process_attempt', 1, {
				aggregates: ['avg', 'min', 'max'],
			});

			// You could add your own business logic metrics here
			if (request.url.includes('/api')) {
				metrics.count('worker.api_request', 1);
			}

			// Create response
			response = new Response('Hello World!');

			// Record success metric
			metrics.count('worker.process_success', 1);
		} catch (error) {
			if (error instanceof Error) {
				// Record error metric
				metrics.count('worker.process_error', 1, {
					error_name: error.name,
				});
			}

			// Return error response
			response = new Response('Internal Server Error', { status: 500 });
		} finally {
			const requestDuration = Date.now() - requestStart;
			metrics.gauge('worker.request.duration', requestDuration, {
				status: response.status.toString(),
			});

			// Track response size
			const contentLength = response.headers.get('content-length');
			if (contentLength) {
				metrics.gauge('worker.response.size', Number.parseInt(contentLength, 10));
			}
		}

		// Gauge example: track active connections (fake example)
		const activeConnections = Math.floor(Math.random() * 100);
		metrics.histogram('worker.connections.active', activeConnections, {
			aggregates: ['avg', 'min', 'max'],
		});

		return response;
	},
} satisfies ExportedHandler<Env>;
