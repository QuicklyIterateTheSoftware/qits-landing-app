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
import type { TelemetryTraces } from './observability.consumes';
import { observabilityGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  TELEMETRY_ERRORS,
  TELEMETRY_LOGS,
  TELEMETRY_METRICS,
  TELEMETRY_SOURCES,
  TELEMETRY_STORE,
  TELEMETRY_TRACE,
  TELEMETRY_TRACES,
} from './observability.operations';

/**
 * qits-landing-app's pact with qits-observability-service (qits-2313), in
 * `pacts/qits-landing-app_qits-observability-service.json`: the Observability section's reads
 * (`observability.operations.ts`). The operations are the only users of qits-observability's
 * client, so this file is the whole pact.
 *
 * The sources, in an empty buffer (the page's "nothing buffered") and in one holding one platform
 * service's telemetry (`telemetry from one platform service`), each row with its services' names
 * (the Traces page's service lens, qits-2342); the logs as the Logs page asks for them by
 * default, no source at all, every source merged (`telemetry from two platform services`,
 * qits-2534), with each line's service, source and trace id, and that state's sources (the
 * service filter's options), and the empty buffer's merged logs, none; that source's logs as an old
 * `?source=` link asks for them (the source alone), and the same narrowed to the last hour
 * (`sinceMinutes`, `telemetry records of every kind`); that source's error groups as the Errors page asks for them
 * by default (the source alone, qits-2339); that source's metric series, the latest point of
 * each, as the Metrics page asks for them (the source alone, never `name`, qits-2340); that
 * source's traces as the Traces page asks for them by default (the source alone: newest first, no
 * floor, every service, everything buffered are the door's defaults, and `limit` is never sent,
 * qits-2342); and one of that source's traces as the trace page asks for it (the trace id in the
 * path and the source alone, never `repositoryId` or `workspaceId`, qits-2343), with the
 * buffer's own state, which the page reads after an empty trace for whether it ever evicted
 * spans (`evictedSpans`); the empty buffer's own trace, no spans and no logs, and its own
 * state, nothing evicted (from `@qits/observability-golden-masters` 2026.1120.180009 on).
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
const TWO_SERVICES = 'telemetry from two platform services';

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

  it('show-telemetry-logs: every source’s logs merged, oldest first, each naming its service', () =>
    given(TELEMETRY_LOGS, TWO_SERVICES, 'show-telemetry-logs').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_LOGS.fetch({ query: {} }));
      expect(error).toBeUndefined();
      // The mock answers each array with its first recorded element; the recording's merge of
      // two sources is checked on the recording itself.
      const logs = data?.logs ?? [];
      expect(logs.length).toBeGreaterThan(0);
      for (const line of logs) {
        expect(line.source).toBeTruthy();
        expect(line.serviceName).toBeTruthy();
        expect(line.traceId).toBeDefined();
      }
      const recorded = masters.body<{ logs: { source: string; epochNanos: number }[] }>(
        TWO_SERVICES,
        'searchTelemetryLogs',
      ).logs;
      expect(new Set(recorded.map((line) => line.source)).size).toBe(2);
      expect(recorded.map((line) => line.epochNanos)).toEqual(
        recorded.map((line) => line.epochNanos).sort((a, b) => a - b),
      );
      expect(data?.truncated).toBe(false);
    }));

  it('show-telemetry-logs: an empty buffer’s merged logs are none', () =>
    given(TELEMETRY_LOGS, EMPTY, 'show-telemetry-logs').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_LOGS.fetch({ query: {} }));
      expect(error).toBeUndefined();
      expect(data?.logs).toEqual([]);
      expect(data?.truncated).toBe(false);
    }));

  it('show-telemetry-sources: two platform services, the Logs page’s service options', () =>
    given(TELEMETRY_SOURCES, TWO_SERVICES, 'show-telemetry-sources').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_SOURCES.fetch({}));
      expect(error).toBeUndefined();
      for (const source of data?.sources ?? []) {
        expect(source.services?.[0]?.name).toBeTruthy();
      }
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

  it('show-telemetry-trace: an empty buffer’s trace, no spans and no logs', () =>
    given(TELEMETRY_TRACE, EMPTY, 'show-telemetry-trace').executeTest(async (server) => {
      const traceId = masters.operation(EMPTY, 'getTelemetryTrace').params['traceId'];
      const source = masters.operation(EMPTY, 'getTelemetryTrace').params['source'];
      const { data, error } = await at(server.url, () =>
        TELEMETRY_TRACE.fetch({ path: { traceId }, query: { source } }),
      );
      expect(error).toBeUndefined();
      expect(data?.trace?.spans).toEqual([]);
      expect(data?.trace?.logs).toEqual([]);
    }));

  it('show-telemetry-trace: the empty buffer’s own state, nothing evicted', () =>
    given(TELEMETRY_STORE, EMPTY, 'show-telemetry-trace').executeTest(async (server) => {
      const { data, error } = await at(server.url, () => TELEMETRY_STORE.fetch({}));
      expect(error).toBeUndefined();
      expect(data?.evictedSpans).toBe(0);
    }));

  it('show-telemetry-traces: a source’s traces, newest first', () =>
    given(TELEMETRY_TRACES, ONE_SERVICE, 'show-telemetry-traces').executeTest(async (server) => {
      const { data, error } = await at(server.url, () =>
        TELEMETRY_TRACES.fetch({ query: { source: sourceOf(ONE_SERVICE) } }),
      );
      expect(error).toBeUndefined();
      const traces = data?.traces ?? [];
      expect(traces.length).toBeGreaterThan(1);
      expect(traces.map((trace) => trace.startEpochNanos ?? 0)).toEqual(
        traces.map((trace) => trace.startEpochNanos ?? 0).sort((a, b) => b - a),
      );
      for (const trace of traces) {
        expect(trace.traceId).toBeTruthy();
        expect(trace.rootName).toBeTruthy();
        expect(trace.rootService).toBeTruthy();
        expect(trace.rootRoute).toBeTruthy();
        expect(trace.services?.length).toBeGreaterThan(0);
        expect(trace.durationMs).toBeGreaterThanOrEqual(0);
        expect(trace.spanCount).toBeGreaterThan(0);
        expect(trace.rootMissing).toBe(false);
      }
      expect(data?.total).toBe(traces.length);
      expect(data?.truncated).toBe(false);
      // The mock answers each array with its first recorded element, matched by type; the
      // recording itself is the newest-first pair the Traces page shows, one of them errored.
      const recorded =
        masters.body<TelemetryTraces>(ONE_SERVICE, 'listTelemetryTraces').traces ?? [];
      expect(recorded.map((trace) => trace.rootName)).toEqual(['GET /health', 'GET /invoices']);
      expect(recorded[0].startEpochNanos ?? 0).toBeGreaterThan(recorded[1].startEpochNanos ?? 0);
      expect(
        recorded.some((trace) => (trace.errorSpanCount ?? 0) > 0 && trace.hasException === true),
      ).toBe(true);
    }));
});
