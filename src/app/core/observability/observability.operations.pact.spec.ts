import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { QitsOperationIdentity } from '@qits/angular';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { client as observabilityClient } from '../../api/observability/client.gen';
import { provideHeyApiClient } from '../../api/observability/client/client.gen';
import type { InteractionSlug } from '../../interactions';
import { observabilityGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  TELEMETRY_ERRORS,
  TELEMETRY_LOGS,
  TELEMETRY_METRICS,
  TELEMETRY_SLOW_SPANS,
  TELEMETRY_SOURCES,
  TELEMETRY_STORE,
  TELEMETRY_TRACE,
} from './observability.operations';

/**
 * qits-landing-app's pact with qits-observability-service (qits-2313), in
 * `pacts/qits-landing-app_qits-observability-service.json`: the Observability section's reads
 * (`observability.operations.ts`). The operations are the only users of qits-observability's
 * client, so this file is the whole pact.
 *
 * The sources, in an empty buffer (the page's "nothing buffered") and in one holding one platform
 * service's telemetry (`telemetry from one platform service`); that source's logs as the page asks
 * for them by default (the source alone), and the same narrowed to the last hour (`sinceMinutes`,
 * `telemetry records of every kind`); that source's error groups as the Errors page asks for them
 * by default (the source alone, qits-2339); that source's metric series, the latest point of
 * each, as the Metrics page asks for them (the source alone, never `name`, qits-2340); and that
 * source's slow spans as the Slow spans page asks for them by default (the source and the floor,
 * `thresholdMs=500`, always sent; no `sort`, `sinceMinutes` or `limit`, qits-2341); and one of
 * that source's traces as the trace page asks for it (the trace id in the path and the source
 * alone, never `repositoryId` or `workspaceId`, qits-2343), with the buffer's own state, which the
 * page reads after an empty trace for whether it ever evicted spans (`evictedSpans`).
 *
 * Each interaction comes from the operation itself (`OP.operationId`, `OP.consumes`; `OP.provider`
 * checked against the spec's literal provider), and each test runs the operation's own `fetch`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-observability-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

const EMPTY = 'an empty telemetry buffer';
const ONE_SERVICE = 'telemetry from one platform service';
const EVERY_KIND = 'telemetry records of every kind';

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-observability-operations-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** Runs `call` against the mock server at `url`, in an injection context. */
function at<T>(url: string, call: () => Promise<T>): Promise<T> {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      provideHttpClient(withFetch()),
      provideHeyApiClient(observabilityClient),
    ],
  });
  observabilityClient.setConfig({ baseUrl: url });
  return TestBed.runInInjectionContext(call);
}

/** The interaction for `op` in `state`, triggered by `interaction`; `op` must be `PROVIDER`'s. */
const given = (
  op: QitsOperationIdentity & { readonly consumes: readonly string[] },
  state: string,
  interaction: InteractionSlug,
) => {
  if (op.provider !== PROVIDER) throw new Error(`${op.operationId} is ${op.provider}'s`);
  return addGoldenInteraction(pact, masters, {
    provider: PROVIDER,
    state,
    operationId: op.operationId,
    trigger: { kind: 'ui', app: CONSUMER, interaction },
    consumes: op.consumes,
  });
};

/** The source `state` recorded its logs read for. */
const sourceOf = (state: string): string =>
  masters.operation(state, 'searchTelemetryLogs').params['source'];

describe('qits-landing-app → qits-observability-service pact: the Observability section', () => {
  afterAll(() => {
    observabilityClient.setConfig({ baseUrl: '' });
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('show-telemetry-sources: an empty buffer has no sources', () =>
    given(TELEMETRY_SOURCES, EMPTY, 'show-telemetry-sources').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_SOURCES.fetch({}));
      expect(error).toBeUndefined();
      expect(data?.sources).toEqual([]);
    }));

  it('show-telemetry-sources: one platform service, with its counts and reach', () =>
    given(TELEMETRY_SOURCES, ONE_SERVICE, 'show-telemetry-sources').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_SOURCES.fetch({}));
      expect(error).toBeUndefined();
      const [source] = data?.sources ?? [];
      expect(source?.kind).toBe('SERVICE');
      expect(source?.key).toBe(sourceOf(ONE_SERVICE));
      expect(source?.logs).toBeGreaterThan(0);
      expect(source?.oldestReceivedAt).toBeTruthy();
    }));

  it('show-telemetry-logs: a source’s logs, oldest first', () =>
    given(TELEMETRY_LOGS, ONE_SERVICE, 'show-telemetry-logs').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        TELEMETRY_LOGS.fetch({ query: { source: sourceOf(ONE_SERVICE) } }),
      );
      expect(error).toBeUndefined();
      const logs = data?.logs ?? [];
      expect(logs.length).toBeGreaterThan(1);
      expect(logs.map((line) => line.epochNanos ?? 0)).toEqual(
        logs.map((line) => line.epochNanos ?? 0).sort((a, b) => a - b),
      );
      expect(logs.every((line) => !!line.resourceAttributes?.['service.version'])).toBe(true);
      expect(data?.truncated).toBe(false);
    }));

  it('show-telemetry-logs: a source’s logs of the last hour', () =>
    given(TELEMETRY_LOGS, EVERY_KIND, 'show-telemetry-logs').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        TELEMETRY_LOGS.fetch({ query: { source: sourceOf(EVERY_KIND), sinceMinutes: 60 } }),
      );
      expect(error).toBeUndefined();
      expect(data?.logs?.length).toBeGreaterThan(0);
    }));

  it('show-telemetry-errors: a source’s error groups, each with its spans and logs', () =>
    given(TELEMETRY_ERRORS, ONE_SERVICE, 'show-telemetry-errors').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        TELEMETRY_ERRORS.fetch({ query: { source: sourceOf(ONE_SERVICE) } }),
      );
      expect(error).toBeUndefined();
      const [group] = data?.groups ?? [];
      expect(group?.traceId).toBeTruthy();
      expect(group?.serviceName).toBeTruthy();
      const [span] = group?.errorSpans ?? [];
      expect(span?.events?.some((event) => event.exception === true)).toBe(true);
      expect(span?.resourceAttributes?.['service.version']).toBeTruthy();
      expect(group?.errorLogs?.[0]?.severityText).toBe('ERROR');
      expect(data?.total).toBe(data?.groups?.length);
      expect(data?.truncated).toBe(false);
    }));

  it('show-telemetry-metrics: a source’s metric series, the latest point of each', () =>
    given(TELEMETRY_METRICS, ONE_SERVICE, 'show-telemetry-metrics').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        TELEMETRY_METRICS.fetch({ query: { source: sourceOf(ONE_SERVICE) } }),
      );
      expect(error).toBeUndefined();
      const metrics = data?.metrics ?? [];
      expect(metrics.length).toBeGreaterThan(0);
      for (const metric of metrics) {
        expect(metric.name).toBeTruthy();
        expect(typeof metric.value).toBe('number');
        expect(metric.epochNanos).toBeGreaterThan(0);
        expect(metric.serviceName).toBeTruthy();
        expect(metric.attributes).toBeDefined();
      }
      expect(metrics.some((metric) => metric.unit === 'By')).toBe(true);
    }));

  it('show-telemetry-slow-spans: a source’s spans at or above 500 ms, slowest first', () =>
    given(TELEMETRY_SLOW_SPANS, ONE_SERVICE, 'show-telemetry-slow-spans').executeTest(
      async (server) => {
        const { data, error } = await at(server.url, () =>
          TELEMETRY_SLOW_SPANS.fetch({
            query: { source: sourceOf(ONE_SERVICE), thresholdMs: 500 },
          }),
        );
        expect(error).toBeUndefined();
        const spans = data?.spans ?? [];
        expect(spans.length).toBeGreaterThan(1);
        expect(spans.every((span) => (span.durationMs ?? 0) >= 500)).toBe(true);
        expect(spans.map((span) => span.durationMs ?? 0)).toEqual(
          spans.map((span) => span.durationMs ?? 0).sort((a, b) => b - a),
        );
        for (const span of spans) {
          expect(span.traceId).toBeTruthy();
          expect(span.spanId).toBeTruthy();
          expect(span.name).toBeTruthy();
          expect(span.kind).toBeTruthy();
          expect(span.startEpochNanos).toBeGreaterThan(0);
          expect(span.resourceAttributes?.['service.version']).toBeTruthy();
        }
        expect(spans.some((span) => span.status === 'ERROR')).toBe(true);
        expect(spans.some((span) => span.events?.some((event) => event.exception === true))).toBe(
          true,
        );
        expect(spans.some((span) => !!span.attributes?.['http.route'])).toBe(true);
        expect(data?.total).toBe(spans.length);
        expect(data?.truncated).toBe(false);
      },
    ));

  it('show-telemetry-trace: one trace of a source, its spans by start and its logs by time', () =>
    given(TELEMETRY_TRACE, ONE_SERVICE, 'show-telemetry-trace').executeTest(async (server) => {
      const traceId = masters.operation(ONE_SERVICE, 'getTelemetryTrace').params['traceId'];
      const { data, error } = await at(server.url, () =>
        TELEMETRY_TRACE.fetch({ path: { traceId }, query: { source: sourceOf(ONE_SERVICE) } }),
      );
      expect(error).toBeUndefined();
      const spans = data?.trace?.spans ?? [];
      expect(spans.length).toBeGreaterThan(1);
      expect(spans.map((span) => span.startEpochNanos ?? 0)).toEqual(
        spans.map((span) => span.startEpochNanos ?? 0).sort((a, b) => a - b),
      );
      const [root, child] = spans;
      expect(root.parentSpanId).toBe('');
      expect(child.parentSpanId).toBe(root.spanId);
      for (const span of spans) {
        expect(span.spanId).toBeTruthy();
        expect(span.serviceName).toBeTruthy();
        expect(span.scopeName).toBeTruthy();
        expect(span.name).toBeTruthy();
        expect(span.kind).toBeTruthy();
        expect(span.durationMs).toBeGreaterThan(0);
        expect(span.resourceAttributes?.['service.version']).toBeTruthy();
      }
      expect(root.status).toBe('ERROR');
      expect(root.statusMessage).toBeTruthy();
      expect(root.attributes?.['http.route']).toBeTruthy();
      const exception = root.events?.find((event) => event.exception === true);
      expect(exception?.attributes?.['exception.type']).toBeTruthy();
      expect(exception?.attributes?.['exception.stacktrace']).toBeTruthy();
      const logs = data?.trace?.logs ?? [];
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.map((log) => log.epochNanos ?? 0)).toEqual(
        logs.map((log) => log.epochNanos ?? 0).sort((a, b) => a - b),
      );
      for (const log of logs) {
        expect(log.severityText).toBeTruthy();
        expect(log.body).toBeTruthy();
        expect(log.spanId).toBe(root.spanId);
      }
    }));

  it('show-telemetry-trace: the buffer’s state, how many spans it evicted', () =>
    given(TELEMETRY_STORE, ONE_SERVICE, 'show-telemetry-trace').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_STORE.fetch({}));
      expect(error).toBeUndefined();
      expect(data?.evictedSpans).toBe(0);
    }));
});
