import { provideHttpClient } from '@angular/common/http';
import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as observabilityClient } from '../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../api/observability/client/client.gen';
import type {
  TelemetrySlowSpans,
  TelemetrySources,
} from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { observabilityGoldenMasters } from '../../../../../../testing/golden-masters';
import { ObservabilitySlowSpansPage } from './observability-slow-spans.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ONE_SERVICE = 'telemetry from one platform service';
const SOURCES = '/observability/api/telemetry/sources';
const SLOW_SPANS = '/observability/api/telemetry/slow-spans';

/**
 * The recorded answer: `GET /invoices` (SERVER, 750 ms, ERROR, an exception event,
 * `http.route=/invoices`) and `SELECT invoices` (CLIENT, 600 ms, UNSET), slowest first.
 */
const recorded = (): TelemetrySlowSpans =>
  observabilityGoldenMasters.body<TelemetrySlowSpans>(ONE_SERVICE, 'listSlowSpans');

/** The recorded sources: one SERVICE source, `_service/qits-example`, holding 3 spans. */
const sources = (): TelemetrySources =>
  observabilityGoldenMasters.body<TelemetrySources>(ONE_SERVICE, 'listTelemetrySources');

/**
 * The Slow spans page (qits-2341) on what its screenshots cannot show: the query each lens sends,
 * and answers no recording holds, each derived from qits-observability's recorded slow spans and
 * sources ("telemetry from one platform service"): a truncated answer (the recorded spans with a
 * larger `total`), an empty one, a source whose row counts no spans, and a span with a `url.full`.
 */
describe('ObservabilitySlowSpansPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(observabilityClient),
        { provide: SelectedProject, useValue: { slug: signal('p') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Runs the page's effects and lets the client build its requests. */
  async function ticked() {
    for (let i = 0; i < 3; i++) {
      TestBed.tick();
      await settle();
    }
  }

  /** The open slow-spans reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === SLOW_SPANS).filter((r) => !r.cancelled);

  /** The query `read` was sent with, as name → value. */
  const params = (read: TestRequest): Record<string, string> =>
    Object.fromEntries(new URL(read.request.urlWithParams, 'http://x').searchParams);

  /**
   * The page at `?source=_service/qits-example` (and `query`), its sources answered with `rows`
   * (a 404 when null) and its one slow-spans read with `answer`; the read and the page.
   */
  async function shown(
    answer: TelemetrySlowSpans,
    query = '',
    rows: TelemetrySources | null = null,
  ) {
    await TestBed.inject(Router).navigateByUrl(`/?source=_service%2Fqits-example${query}`);
    const fixture = TestBed.createComponent(ObservabilitySlowSpansPage);
    fixture.detectChanges();
    await ticked();
    const sourcesRead = http.expectOne(SOURCES);
    if (rows) sourcesRead.flush(rows);
    else sourcesRead.flush(null, { status: 404, statusText: 'Not Found' });
    const open = reads();
    expect(open).toHaveLength(1);
    const read = open[0];
    read.flush(answer);
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rowsShown = [...element.querySelectorAll<HTMLElement>('[data-span]')];
    return { fixture, element, read, rows: rowsShown };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('reads by default with the source and thresholdMs=500 alone', async () => {
    const { read } = await shown(recorded());
    expect(params(read)).toEqual({ source: '_service/qits-example', thresholdMs: '500' });
  });

  it('reads no slow spans before a source is chosen', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    const fixture = TestBed.createComponent(ObservabilitySlowSpansPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(sources());
    await ticked();
    fixture.detectChanges();
    expect(reads()).toHaveLength(0);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-no-source]')?.classList).not.toContain('hidden');
    expect(element.querySelector('section[aria-label="Slow spans"]')?.classList).toContain(
      'hidden',
    );
  });

  it('sends each lens as the door names it: the floor, the order and the time range', async () => {
    const { read } = await shown(recorded(), '&threshold=1000&sort=recent&since=60');
    expect(params(read)).toEqual({
      source: '_service/qits-example',
      thresholdMs: '1000',
      sort: 'recent',
      sinceMinutes: '60',
    });
  });

  it('sends thresholdMs=0 for Any duration, and the default for a floor it does not offer', async () => {
    const any = await shown(recorded(), '&threshold=0');
    expect(params(any.read)['thresholdMs']).toBe('0');
    any.fixture.destroy();

    const odd = await shown(recorded(), '&threshold=250&sort=slowest');
    expect(params(odd.read)).toEqual({ source: '_service/qits-example', thresholdMs: '500' });
  });

  it('puts a chosen floor into ?threshold=, and the default back out of it', async () => {
    const { fixture, element } = await shown(recorded());
    const router = TestBed.inject(Router);
    const [floor] = element.querySelectorAll<HTMLSelectElement>('select');
    floor.value = '100';
    floor.dispatchEvent(new Event('change'));
    await ticked();
    expect(router.url).toContain('threshold=100');
    const again = reads();
    expect(again).toHaveLength(1);
    expect(params(again[0])['thresholdMs']).toBe('100');
    again[0].flush(recorded());
    await ticked();

    fixture.detectChanges();
    floor.value = '500';
    floor.dispatchEvent(new Event('change'));
    await ticked();
    expect(router.url).not.toContain('threshold=');
    reads()[0]?.flush(recorded());
    await ticked();
  });

  it('shows each span in the door’s order: duration, name, kind, call, status, start, version, trace link', async () => {
    const { rows } = await shown(recorded());
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'GET /invoices',
      'SELECT invoices',
    ]);
    const [invoices, select] = rows;
    expect(text(invoices.querySelector('[data-duration]'))).toBe('750 ms');
    expect(text(invoices)).toContain('SERVER');
    expect(text(invoices.querySelector('[data-call]'))).toBe('/invoices');
    expect(invoices.querySelector('[data-error]')).not.toBeNull();
    expect(invoices.querySelector('[data-exception]')).not.toBeNull();
    expect(text(invoices)).toContain('2026-01-01 00:00:00.000');
    expect(text(invoices)).toContain('2026.1231.120000');
    expect(text(invoices)).toContain('trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01');
    expect(invoices.querySelector('[data-trace]')?.getAttribute('href')).toBe(
      '/projects/p/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example',
    );

    expect(text(select.querySelector('[data-duration]'))).toBe('600 ms');
    expect(text(select)).toContain('CLIENT');
    expect(select.querySelector('[data-call]')?.classList).toContain('hidden');
    expect(select.querySelector('[data-error]')).toBeNull();
    expect(select.querySelector('[data-exception]')).toBeNull();
  });

  it('names the call by url.full over http.route, and draws seconds from a second on', async () => {
    // The recorded SERVER span, slower and with a client's full URL beside its route.
    const [invoices] = recorded().spans!;
    const { rows } = await shown({
      ...recorded(),
      spans: [
        {
          ...invoices,
          durationMs: 1250,
          attributes: { ...invoices.attributes, 'url.full': 'https://example.test/invoices' },
        },
      ],
      total: 1,
    });
    expect(text(rows[0].querySelector('[data-duration]'))).toBe('1.3 s');
    expect(text(rows[0].querySelector('[data-call]'))).toBe('https://example.test/invoices');
  });

  it('says what a truncated answer kept: the slowest, or with sort=recent the newest', async () => {
    // The recorded spans as the first 2 of 40 that matched.
    const truncated = { ...recorded(), total: 40, truncated: true };
    const slowest = await shown(truncated);
    expect(text(slowest.element.querySelector('[data-truncated]'))).toBe(
      'Showing the slowest 2 of 40 matching spans',
    );
    slowest.fixture.destroy();

    const newest = await shown(truncated, '&sort=recent');
    expect(text(newest.element.querySelector('[data-truncated]'))).toBe(
      'Showing the newest 2 of 40 matching spans',
    );
  });

  it('hides the truncation line when the answer is whole', async () => {
    const { element } = await shown(recorded());
    expect(element.querySelector('[data-truncated]')?.classList).toContain('hidden');
  });

  describe('an empty answer says why', () => {
    // The recorded answer with no span in it.
    const none = (): TelemetrySlowSpans => ({ ...recorded(), spans: [], total: 0 });

    const reason = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-empty]');

    it('the source holds no spans when its source row counts none', async () => {
      // The recorded source, its spans gone.
      const recordedSources = sources();
      const empty: TelemetrySources = {
        sources: recordedSources.sources!.map((source) => ({ ...source, spans: 0 })),
      };
      const { element } = await shown(none(), '&since=60', empty);
      expect(reason(element)?.dataset['empty']).toBe('no-spans');
      expect(text(reason(element))).toBe(
        'This source holds no spans: it has sent no traces lately.',
      );
    });

    it('none reaches the floor, pointing at Any duration', async () => {
      const { element } = await shown(none(), '&threshold=1000', sources());
      expect(reason(element)?.dataset['empty']).toBe('below-floor');
      expect(text(reason(element))).toContain('No span of this source took 1 s or longer.');
      const button = [...reason(element)!.querySelectorAll('button')].find(
        (b) => text(b) === 'Any duration',
      );
      button!.click();
      await ticked();
      expect(TestBed.inject(Router).url).toContain('threshold=0');
      reads()[0]?.flush(none());
      await ticked();
    });

    it('none falls in the time range, pointing at clearing it', async () => {
      const { element } = await shown(none(), '&threshold=0&since=15', sources());
      expect(reason(element)?.dataset['empty']).toBe('outside-window');
      expect(text(reason(element))).toContain('No span of this source falls in this time range.');
      const button = [...reason(element)!.querySelectorAll('button')].find(
        (b) => text(b) === 'Everything buffered',
      );
      button!.click();
      await ticked();
      expect(TestBed.inject(Router).url).not.toContain('since=');
      reads()[0]?.flush(none());
      await ticked();
    });
  });
});
