import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as observabilityClient } from '../../../../../../api/observability/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import type {
  TelemetryStore,
  TelemetryTrace,
  TelemetryTraceSpan,
} from '$core/observability/observability.consumes';
import {
  goldenMaster,
  observabilityGoldenMasters,
} from '../../../../../../../testing/golden-masters';
import { ObservabilityTracePage } from './observability-trace.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ONE_SERVICE = 'telemetry from one platform service';
const SOURCE = '_service/qits-example';
const STORE = '/observability/api/telemetry/store';

/**
 * The recorded trace (`6a1f0c2b9d8e47f3a5b4c3d2e1f00a01`): `GET /invoices` (SERVER, 750 ms, ERROR
 * with an exception event, the root) and `SELECT invoices` (CLIENT, 600 ms, its child), and two
 * logs written in the root, INFO then ERROR.
 */
const recorded = (): TelemetryTrace =>
  observabilityGoldenMasters.body<TelemetryTrace>(ONE_SERVICE, 'getTelemetryTrace');

/** The recorded store: nothing evicted. */
const recordedStore = (): TelemetryStore =>
  observabilityGoldenMasters.body<TelemetryStore>(ONE_SERVICE, 'getTelemetryStore');

const TRACE_ID = observabilityGoldenMasters.operation(ONE_SERVICE, 'getTelemetryTrace').params[
  'traceId'
];
const TRACE = `/observability/api/telemetry/traces/${TRACE_ID}`;

@Component({ template: 'stub' })
class Stub {}

/**
 * The trace page (qits-2343) on what its screenshots cannot show: the request it sends and the
 * one it never sends, the selection in the URL, and answers no recording holds, each derived from
 * qits-observability's recorded trace ("telemetry from one platform service"): an empty trace with
 * and without eviction, a trace whose root is not buffered, a span whose parent is not buffered,
 * a parent cycle, and a log whose span is not buffered.
 */
describe('ObservabilityTracePage', () => {
  let http: HttpTestingController;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/observability/traces/:traceId',
            component: ObservabilityTracePage,
          },
          { path: 'projects/:slug/observability/slow-spans', component: Stub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(observabilityClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function answered(harness: RouterTestingHarness) {
    for (let i = 0; i < 3; i++) {
      await settle();
      TestBed.tick();
      harness.fixture.detectChanges();
    }
  }

  /** The open reads of `url`. */
  const reads = (url: string): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === url).filter((r) => !r.cancelled);

  /** The query `read` was sent with, as name → value. */
  const params = (read: TestRequest): Record<string, string> =>
    Object.fromEntries(new URL(read.request.urlWithParams, 'http://x').searchParams);

  /** The page at `query` (`?source=` by default); the harness, before any trace read is answered. */
  async function open(query = `?source=${encodeURIComponent(SOURCE)}`, traceId = TRACE_ID) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/observability/traces/${traceId}${query}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    return harness;
  }

  /** The page with its one trace read answered with `answer` (a status alone when a number). */
  async function shown(answer: TelemetryTrace | number = recorded(), query?: string) {
    const harness = await open(query);
    const open_ = reads(TRACE);
    expect(open_).toHaveLength(1);
    const read = open_[0];
    if (typeof answer === 'number') read.flush(null, { status: answer, statusText: 'Error' });
    else read.flush(answer);
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    return { harness, element, read };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The text of `element`'s leaves, joined by spaces (jsdom has no `innerText`). */
  const words = (element: Element | null | undefined) =>
    [...(element?.querySelectorAll('*') ?? [])]
      .filter((leaf) => leaf.children.length === 0)
      .map(text)
      .filter(Boolean)
      .join(' ');

  const visible = (element: Element | null | undefined) => !!element && !element.closest('.hidden');

  /** The recorded trace with its spans replaced by `spans` (and its logs kept). */
  const withSpans = (spans: TelemetryTraceSpan[]): TelemetryTrace => ({
    trace: { ...recorded().trace, spans },
  });

  const rowNames = (element: HTMLElement) =>
    [...element.querySelectorAll('[data-span] button')].map((b) => b.getAttribute('aria-label'));

  it('reads the trace by its id and the source alone', async () => {
    const { read } = await shown();
    expect(params(read)).toEqual({ source: SOURCE });
    expect(reads(STORE)).toHaveLength(0);
  });

  it('reads nothing without a source, and points to the Slow spans page', async () => {
    const harness = await open('');
    expect(reads(TRACE)).toHaveLength(0);
    const element = harness.routeNativeElement as HTMLElement;
    const none = element.querySelector('[data-no-source]');
    expect(visible(none)).toBe(true);
    expect(none?.querySelector('a')?.getAttribute('href')).toBe(
      `/projects/${project.slug}/observability/slow-spans`,
    );
  });

  it('shows the header: the id, the source and the summary', async () => {
    const { element } = await shown();
    expect(text(element.querySelector('[data-trace-id]'))).toBe(TRACE_ID);
    expect(text(element.querySelector('[data-source]'))).toBe(SOURCE);
    expect(text(element.querySelector('[data-summary]'))).toBe(
      '2 spans · 1 service · 750 ms · 1 error span',
    );
  });

  it('draws the waterfall nested by parent, with its marks and log counts', async () => {
    const { element } = await shown();
    const rows = [...element.querySelectorAll<HTMLElement>('[data-span]')];
    expect(rowNames(element)).toEqual(['GET /invoices', 'SELECT invoices']);
    const [root, child] = rows;
    expect(root.querySelector('[data-error]')).not.toBeNull();
    expect(root.querySelector('[data-exception]')).not.toBeNull();
    expect(text(root.querySelector('[data-log-count]'))).toBe('2 logs');
    expect(text(root.querySelector('[data-duration]'))).toBe('750 ms');
    expect(child.querySelector('[data-error]')).toBeNull();
    expect(child.querySelector('[data-log-count]')).toBeNull();
    expect(child.querySelector('[data-parent-missing]')).toBeNull();
    const indent = (row: HTMLElement) =>
      (row.querySelector('button > span') as HTMLElement).style.paddingLeft;
    expect(indent(root)).toBe('0rem');
    expect(indent(child)).toBe('0.9rem');
    expect(visible(element.querySelector('[data-root-missing]'))).toBe(false);
  });

  it('shows the first span’s detail until one is chosen, then the chosen one’s, in ?span=', async () => {
    const { element, harness } = await shown();
    const detail = () => element.querySelector<HTMLElement>('section[aria-label="Span detail"]');
    expect(text(detail()?.querySelector('h2'))).toBe('GET /invoices');
    expect(text(detail())).toContain('java.lang.IllegalStateException: invoice store unreachable');
    expect(text(detail())).toContain('at eu.example.InvoiceResource.list');
    expect(text(detail()?.querySelector('[data-status-message]'))).toBe(
      'invoice store unreachable',
    );
    expect(words(detail()?.querySelector('[data-attributes]'))).toContain('http.route /invoices');
    expect(words(detail()?.querySelector('[data-resource-attributes]'))).toContain(
      'service.version 2026.1231.120000',
    );
    expect(text(detail()?.querySelector('[data-start]'))).toBe('2026-01-01 00:00:00.000 · +0 ms');

    element.querySelectorAll<HTMLButtonElement>('[data-span] button')[1].click();
    await answered(harness);
    expect(TestBed.inject(Router).url).toContain('span=7b2e1d3c4f5a6b02');
    expect(reads(TRACE)).toHaveLength(0);
    expect(text(detail()?.querySelector('h2'))).toBe('SELECT invoices');
    expect(text(detail()?.querySelector('[data-start]'))).toBe('2026-01-01 00:00:00.050 · +50 ms');
    expect(text(detail()?.querySelector('[data-events]'))).toBe('This span recorded no events.');
    expect(element.querySelectorAll('[data-span] button')[1].getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('keeps the chosen span across Refresh', async () => {
    const { element, harness } = await shown(
      recorded(),
      `?source=${encodeURIComponent(SOURCE)}&span=7b2e1d3c4f5a6b02`,
    );
    const detail = () => element.querySelector<HTMLElement>('section[aria-label="Span detail"]');
    expect(text(detail()?.querySelector('h2'))).toBe('SELECT invoices');
    const refresh = [...element.querySelectorAll('button')].find((b) => text(b) === 'Refresh');
    refresh!.click();
    await answered(harness);
    const again = reads(TRACE);
    expect(again).toHaveLength(1);
    again[0].flush(recorded());
    await answered(harness);
    expect(text(detail()?.querySelector('h2'))).toBe('SELECT invoices');
  });

  it('shows an event that is not an exception by its attributes', async () => {
    const [root, child] = recorded().trace!.spans!;
    const { element } = await shown(
      withSpans([
        root,
        {
          ...child,
          events: [
            { name: 'cache.miss', epochNanos: 1767225600060000000, attributes: { key: 'inv-7' } },
          ],
        },
      ]),
      `?source=${encodeURIComponent(SOURCE)}&span=${child.spanId}`,
    );
    const events = element.querySelector('section[aria-label="Span detail"] [data-events]');
    expect(text(events)).toContain('cache.miss');
    expect(text(events)).toContain('+60 ms');
    expect(words(events)).toContain('key inv-7');
  });

  it('lists the correlated logs oldest first, each with its level, offset, body and span', async () => {
    const trace = recorded().trace!;
    // The recorded logs reversed, plus one written in a span that is not buffered.
    const { element } = await shown({
      trace: {
        ...trace,
        logs: [
          ...[...trace.logs!].reverse(),
          { ...trace.logs![0], epochNanos: 1767225600800000000, spanId: 'ffffffffffffffff' },
        ],
      },
    });
    const logs = [...element.querySelectorAll('[data-log]')].map(words);
    expect(logs).toEqual([
      'INFO +10 ms listing invoices in GET /invoices',
      'ERROR +700 ms invoice store unreachable in GET /invoices',
      'INFO +800 ms listing invoices its span is not buffered',
    ]);
  });

  it('draws a span whose parent is not buffered at the top level, marked', async () => {
    const [root, child] = recorded().trace!.spans!;
    const { element } = await shown(
      withSpans([root, { ...child, parentSpanId: 'eeeeeeeeeeeeeeee' }]),
    );
    const rows = [...element.querySelectorAll<HTMLElement>('[data-span]')];
    expect(rows[1].querySelector('[data-parent-missing]')).not.toBeNull();
    expect((rows[1].querySelector('button > span') as HTMLElement).style.paddingLeft).toBe('0rem');
    expect(visible(element.querySelector('[data-root-missing]'))).toBe(false);
  });

  it('says the root is not buffered when every span names a parent', async () => {
    const [root, child] = recorded().trace!.spans!;
    const { element } = await shown(withSpans([child, { ...root, parentSpanId: 'aaaa' }]));
    expect(visible(element.querySelector('[data-root-missing]'))).toBe(true);
  });

  it('draws every span of a parent cycle once', async () => {
    const [root, child] = recorded().trace!.spans!;
    const { element } = await shown(withSpans([{ ...root, parentSpanId: child.spanId }, child]));
    expect(rowNames(element).sort()).toEqual(['GET /invoices', 'SELECT invoices']);
    expect(element.querySelectorAll('[data-parent-missing]')).toHaveLength(2);
  });

  describe('an empty answer', () => {
    const empty = (): TelemetryTrace => withSpans([]);

    it('says no span is buffered, after reading the store, without eviction', async () => {
      const { element, harness } = await shown({ trace: { ...empty().trace, logs: [] } });
      http.expectOne(STORE).flush(recordedStore());
      await answered(harness);
      const shownEmpty = element.querySelector('[data-empty]');
      expect(visible(shownEmpty)).toBe(true);
      expect(text(shownEmpty)).toContain('No spans of this trace are buffered in this source.');
      expect(visible(element.querySelector('[data-evicted]'))).toBe(false);
      expect([...element.querySelectorAll('[role="alert"]')].filter(visible)).toHaveLength(0);
    });

    it('adds that it may have been evicted when the buffer evicted spans', async () => {
      const { element, harness } = await shown({ trace: { ...empty().trace, logs: [] } });
      // The recorded store, after the buffer dropped spans at its cap.
      http.expectOne(STORE).flush({ ...recordedStore(), evictedSpans: 120 });
      await answered(harness);
      expect(visible(element.querySelector('[data-evicted]'))).toBe(true);
      expect(text(element.querySelector('[data-evicted]'))).toContain('It may have been evicted');
    });
  });

  it('says a refusal needs qits:admin', async () => {
    const { element } = await shown(403);
    const alerts = [...element.querySelectorAll('[role="alert"]')].filter(visible);
    expect(alerts.map(text)).toEqual(['Reading telemetry needs qits:admin.']);
    expect(reads(STORE)).toHaveLength(0);
  });

  it('offers Retry when the trace could not be read', async () => {
    const { element, harness } = await shown(500);
    const alerts = [...element.querySelectorAll('[role="alert"]')].filter(visible);
    expect(text(alerts[0])).toContain('This trace could not be read.');
    [...alerts[0].querySelectorAll('button')].find((b) => text(b) === 'Retry')!.click();
    await answered(harness);
    const again = reads(TRACE);
    expect(again).toHaveLength(1);
    again[0].flush(recorded());
    await answered(harness);
    expect(rowNames(element)).toEqual(['GET /invoices', 'SELECT invoices']);
  });
});
