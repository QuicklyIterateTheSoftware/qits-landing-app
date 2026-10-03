import {
  context,
  metrics,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Histogram,
} from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { RequestHandler } from 'express';
import { hostname } from 'node:os';
import { format } from 'node:util';
import type { TelemetryTarget } from './otel-config';

/**
 * The SSR server's OpenTelemetry: traces, logs and metrics, OTLP http/protobuf to the target.
 *
 * NO MODULE PATCHING, ON PURPOSE. `outputMode: server` bundles express and everything else into
 * `server/server.mjs`, so there is no `require('express')` for an auto-instrumentation to hook,
 * and a preloaded `--import` hook would find nothing to patch. What is instrumented here works
 * inside the bundle and in any start order:
 *
 * - server spans: {@link serverSpans}, an express middleware;
 * - outbound fetch spans: the undici instrumentation, which listens on node's diagnostics
 *   channels and patches nothing;
 * - logs: every `console` call is also an OTLP log record, correlated to the active span. The
 *   console output stays, as the fallback when the receiver is down.
 */

const SCOPE = 'qits-landing-server';

/** Console method to log severity. */
const SEVERITIES = {
  debug: [SeverityNumber.DEBUG, 'DEBUG'],
  log: [SeverityNumber.INFO, 'INFO'],
  info: [SeverityNumber.INFO, 'INFO'],
  warn: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR'],
} as const;

/** Starts the SDK. Returns the function that flushes and stops it. */
export function startTelemetry(target: TelemetryTarget): () => Promise<void> {
  const resource = defaultResource().merge(
    resourceFromAttributes({ 'host.name': hostname(), ...target.resourceAttributes }),
  );
  const url = (signal: string) => `${target.endpoint}/v1/${signal}`;

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: url('traces') }))],
  });
  // AsyncLocalStorage context and the W3C trace-context + baggage propagators.
  tracerProvider.register();

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: url('logs') }) }),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: url('metrics') }),
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const receiver = new URL(target.endpoint).origin;
  const undici = new UndiciInstrumentation({
    // Only calls made while serving a request. The passthrough's forward to qits-observability
    // has no parent, and a span for it would be exported through the receiver it describes.
    requireParentforSpans: true,
    ignoreRequestHook: (request) => request.origin === receiver,
  });

  const restoreConsole = bridgeConsole();

  return async () => {
    restoreConsole();
    undici.disable();
    await Promise.allSettled([
      tracerProvider.shutdown(),
      loggerProvider.shutdown(),
      meterProvider.shutdown(),
    ]);
  };
}

/** Copies every `console` call into an OTLP log record. Returns the function that undoes it. */
export function bridgeConsole(): () => void {
  const logger = logs.getLogger(SCOPE);
  const originals = new Map<keyof typeof SEVERITIES, (...args: unknown[]) => void>();
  for (const method of Object.keys(SEVERITIES) as (keyof typeof SEVERITIES)[]) {
    const original = console[method].bind(console);
    originals.set(method, original);
    const [severityNumber, severityText] = SEVERITIES[method];
    console[method] = (...args: unknown[]) => {
      original(...args);
      const error = args.find((arg): arg is Error => arg instanceof Error);
      logger.emit({
        severityNumber,
        severityText,
        body: format(...args),
        attributes: error
          ? {
              'exception.type': error.name,
              'exception.message': error.message,
              'exception.stacktrace': error.stack ?? '',
            }
          : {},
      });
    };
  }
  return () => {
    for (const [method, original] of originals) console[method] = original;
  };
}

/**
 * A SERVER span per request that reaches it, child of the caller's `traceparent` when there is
 * one, and active while the rest of the chain runs, so the render's own spans and log records
 * join it. Mounted after the health probe, the static files and the telemetry routes, so it
 * covers the server-side renders and nothing that would only be noise or a loop.
 *
 * Also records `http.server.request.duration`. The meter is looked up on the first request: the
 * metrics API has no proxy, and a meter taken before the SDK starts would stay a no-op.
 */
export function serverSpans(): RequestHandler {
  const tracer = trace.getTracer(SCOPE);
  let duration: Histogram | undefined;
  return (req, res, next) => {
    duration ??= metrics.getMeter(SCOPE).createHistogram('http.server.request.duration', {
      unit: 's',
      description: 'Duration of HTTP server requests.',
    });
    const started = performance.now();
    const parent = propagation.extract(ROOT_CONTEXT, req.headers);
    const span = tracer.startSpan(
      req.method,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': req.method,
          'url.path': req.path,
          'url.scheme': req.protocol,
          'user_agent.original': req.get('User-Agent') ?? '',
        },
      },
      parent,
    );
    res.once('close', () => {
      const status = res.statusCode;
      span.setAttribute('http.response.status_code', status);
      if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      span.end();
      duration?.record((performance.now() - started) / 1000, {
        'http.request.method': req.method,
        'http.response.status_code': status,
      });
    });
    context.with(trace.setSpan(parent, span), next);
  };
}

/** The active span as a `traceparent` value, or `undefined` when nothing is recording. */
export function activeTraceparent(): string | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier['traceparent'];
}
