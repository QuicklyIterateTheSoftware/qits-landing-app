import { provideHttpClient } from '@angular/common/http';
import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as observabilityClient } from '../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../api/observability/client/client.gen';
import type { TelemetrySources, TelemetryTraces } from '$core/observability/observability.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { observabilityGoldenMasters } from '../../../../../../testing/golden-masters';
import { ObservabilityTracesPage } from './observability-traces.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ONE_SERVICE = 'telemetry from one platform service';
const SOURCES = '/observability/api/telemetry/sources';
const TRACES = '/observability/api/telemetry/traces';

/**
 * The recorded answer, newest first: `GET /health` (route `/health`, 5 ms, 1 span) and
 * `GET /invoices` (route `/invoices`, 750 ms, 2 spans, 1 error span, an exception), both
 * `qits-example`'s; 2 of 2, not truncated.
 */
const recorded = (): TelemetryTraces =>
  observabilityGoldenMasters.body<TelemetryTraces>(ONE_SERVICE, 'listTelemetryTraces');

/** The recorded sources: one SERVICE source, `_service/qits-example`, its one service the same. */
const sources = (): TelemetrySources =>
  observabilityGoldenMasters.body<TelemetrySources>(ONE_SERVICE, 'listTelemetrySources');

/**
 * The Traces page (qits-2342) on what its screenshots cannot show: the query each lens sends, the
 * flat view, and answers no recording holds, each derived from qits-observability's recorded traces
 * and sources ("telemetry from one platform service"): a truncated answer (the recorded traces with
 * a larger `total`), an empty one, a source whose row counts no spans, a rootless trace and a
 * refusal.
 */
describe('ObservabilityTracesPage', () => {
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

  /** The open traces reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === TRACES).filter((r) => !r.cancelled);

  /** The query `read` was sent with, as name → value. */
  const params = (read: TestRequest): Record<string, string> =>
    Object.fromEntries(new URL(read.request.urlWithParams, 'http://x').searchParams);

  /**
   * The page at `?source=_service/qits-example` (and `query`), its sources answered with `rows`
   * (the recorded ones unless given; a 404 when null) and its one traces read with `answer`; the
   * read and the page.
   */
  async function shown(
    answer: TelemetryTraces,
    query = '',
    rows: TelemetrySources | null = sources(),
  ) {
    await TestBed.inject(Router).navigateByUrl(`/?source=_service%2Fqits-example${query}`);
    const fixture = TestBed.createComponent(ObservabilityTracesPage);
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
    return { fixture, element, read };
  }

  const text = (element: Element | null | undefined) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  /** The trace rows shown, by their root span's name. */
  const traceRows = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLElement>('[data-trace]'),
  ];

  const groupRows = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLElement>('[data-group]'),
  ];

  describe('sends each lens only when it is not the door’s default', () => {
    it('reads by default with the source alone', async () => {
      const { read } = await shown(recorded());
      expect(params(read)).toEqual({ source: '_service/qits-example' });
    });

    it('sort=duration as sort', async () => {
      const { read } = await shown(recorded(), '&sort=duration');
      expect(params(read)).toEqual({ source: '_service/qits-example', sort: 'duration' });
    });

    it('a floor above 0 as thresholdMs, and 0 or nonsense as none', async () => {
      const floor = await shown(recorded(), '&threshold=500');
      expect(params(floor.read)).toEqual({ source: '_service/qits-example', thresholdMs: '500' });
      floor.fixture.destroy();

      const nonsense = await shown(recorded(), '&threshold=slow&sort=newest');
      expect(params(nonsense.read)).toEqual({ source: '_service/qits-example' });
    });

    it('service as service', async () => {
      const { read } = await shown(recorded(), '&service=qits-example');
      expect(params(read)).toEqual({ source: '_service/qits-example', service: 'qits-example' });
    });

    it('since as sinceMinutes', async () => {
      const { read } = await shown(recorded(), '&since=60');
      expect(params(read)).toEqual({ source: '_service/qits-example', sinceMinutes: '60' });
    });

    it('view=flat as nothing at all', async () => {
      const { read } = await shown(recorded(), '&view=flat');
      expect(params(read)).toEqual({ source: '_service/qits-example' });
    });
  });

  it('reads no traces before a source is chosen, and says to choose one', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    const fixture = TestBed.createComponent(ObservabilityTracesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(sources());
    await ticked();
    fixture.detectChanges();
    expect(reads()).toHaveLength(0);
    const element = fixture.nativeElement as HTMLElement;
    const choose = element.querySelector('[data-no-source]');
    expect(choose?.classList).not.toContain('hidden');
    expect(text(choose)).toBe('Choose a source above to see its traces.');
    expect(element.querySelector('section[aria-label="Traces"]')?.classList).toContain('hidden');
  });

  it('puts a chosen floor into ?threshold=, and Any duration back out of it', async () => {
    const { fixture, element } = await shown(recorded());
    const router = TestBed.inject(Router);
    const floor = [...element.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
      text(select.closest('label')).startsWith('Duration'),
    )!;
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
    floor.value = '0';
    floor.dispatchEvent(new Event('change'));
    await ticked();
    expect(router.url).not.toContain('threshold=');
    reads()[0]?.flush(recorded());
    await ticked();
  });

  describe('the service lens', () => {
    const select = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-service]')!;

    it('offers the source row’s services, after All services', async () => {
      const { element } = await shown(recorded());
      expect(select(element).classList).not.toContain('hidden');
      expect([...select(element).querySelectorAll('option')].map((o) => text(o))).toEqual([
        'All services',
        'qits-example',
      ]);
    });

    it('is hidden when the source row lists no services', async () => {
      const bare: TelemetrySources = {
        sources: sources().sources!.map((source) => ({ ...source, services: [] })),
      };
      const { element } = await shown(recorded(), '', bare);
      expect(select(element).classList).toContain('hidden');
    });

    it('puts a chosen service into ?service=, and All services back out of it', async () => {
      const { fixture, element } = await shown(recorded());
      const router = TestBed.inject(Router);
      const choice = select(element).querySelector('select')!;
      choice.value = 'qits-example';
      choice.dispatchEvent(new Event('change'));
      await ticked();
      expect(router.url).toContain('service=qits-example');
      reads()[0].flush(recorded());
      await ticked();

      fixture.detectChanges();
      choice.value = '';
      choice.dispatchEvent(new Event('change'));
      await ticked();
      expect(router.url).not.toContain('service=');
      reads()[0]?.flush(recorded());
      await ticked();
    });
  });

  describe('grouped by path, by default', () => {
    it('draws one group per path in the door’s order, with its figures', async () => {
      const { element } = await shown(recorded());
      const groups = groupRows(element);
      expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
        '/health',
        '/invoices',
      ]);
      const [health, invoices] = groups;
      expect(text(health.querySelector('[data-group-meta]'))).toContain('1 trace');
      expect(text(health.querySelector('[data-group-meta]'))).toContain('slowest 5 ms');
      expect(text(health.querySelector('[data-group-meta]'))).toContain('qits-example');
      expect(health.querySelector('[data-errored]')).toBeNull();
      expect(health.querySelector('[data-exception]')).toBeNull();
      expect(text(invoices.querySelector('[data-group-meta]'))).toContain('slowest 750 ms');
      expect(text(invoices.querySelector('[data-group-meta]'))).toContain(
        '2026-01-01 00:00:00.000',
      );
      expect(text(invoices.querySelector('[data-errored]'))).toBe('1 errored');
      expect(invoices.querySelector('[data-exception]')).not.toBeNull();
      // Collapsed: no trace row yet.
      expect(traceRows(element)).toHaveLength(0);
    });

    it('expands a group to its traces, without touching the URL', async () => {
      const { fixture, element } = await shown(recorded());
      const router = TestBed.inject(Router);
      const before = router.url;
      const [, invoices] = groupRows(element);
      const button = invoices.querySelector('button')!;
      expect(button.getAttribute('aria-expanded')).toBe('false');
      button.click();
      fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(router.url).toBe(before);
      const rows = traceRows(invoices);
      expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['GET /invoices']);
      expect(rows[0].querySelector('[data-trace-link]')?.getAttribute('href')).toBe(
        '/projects/p/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example',
      );
      button.click();
      fixture.detectChanges();
      expect(traceRows(element)).toHaveLength(0);
    });
  });

  it('draws one row per trace with view=flat: duration, root, errors, service, spans, start, trace link', async () => {
    const { element } = await shown(recorded(), '&view=flat');
    expect(groupRows(element)).toHaveLength(0);
    const rows = traceRows(element);
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'GET /health',
      'GET /invoices',
    ]);
    const [health, invoices] = rows;
    expect(text(health.querySelector('[data-duration]'))).toBe('5 ms');
    expect(text(health)).toContain('1 span');
    expect(health.querySelector('[data-error]')).toBeNull();
    expect(health.querySelector('[data-exception]')).toBeNull();
    expect(text(invoices.querySelector('[data-duration]'))).toBe('750 ms');
    expect(text(invoices.querySelector('[data-error]'))).toBe('1 error');
    expect(invoices.querySelector('[data-exception]')).not.toBeNull();
    expect(invoices.querySelector('[data-root-missing]')).toBeNull();
    expect(text(invoices)).toContain('qits-example');
    expect(text(invoices)).toContain('2 spans');
    expect(text(invoices)).toContain('2026-01-01 00:00:00.000');
    expect(text(invoices)).toContain('trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01');
    expect(invoices.querySelector('[data-trace-link]')?.getAttribute('href')).toBe(
      '/projects/p/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example',
    );
  });

  it('says a root the buffer lost, and names an unnamed one', async () => {
    // The recorded `GET /invoices` trace, its root gone from the buffer and its name empty.
    const [, invoices] = recorded().traces!;
    const { element } = await shown(
      { ...recorded(), traces: [{ ...invoices, rootName: '', rootMissing: true }], total: 1 },
      '&view=flat',
    );
    const [row] = traceRows(element);
    expect(row.getAttribute('aria-label')).toBe('(unnamed span)');
    expect(text(row.querySelector('[data-root-missing]'))).toBe('(root not buffered)');
  });

  it('says what a truncated answer kept: the newest, or with sort=duration the slowest', async () => {
    // The recorded traces as the first 2 of 40 that matched.
    const truncated = { ...recorded(), total: 40, truncated: true };
    const newest = await shown(truncated);
    expect(text(newest.element.querySelector('[data-truncated]'))).toBe(
      'Showing the newest 2 of 40 matching traces',
    );
    newest.fixture.destroy();

    const slowest = await shown(truncated, '&sort=duration');
    expect(text(slowest.element.querySelector('[data-truncated]'))).toBe(
      'Showing the slowest 2 of 40 matching traces',
    );
  });

  it('hides the truncation line when the answer is whole', async () => {
    const { element } = await shown(recorded());
    expect(element.querySelector('[data-truncated]')?.classList).toContain('hidden');
  });

  describe('an empty answer says why', () => {
    // The recorded answer with no trace in it.
    const none = (): TelemetryTraces => ({ ...recorded(), traces: [], total: 0 });

    const reason = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-empty]');

    /** Clicks `label` in the empty state and answers the read it starts. */
    async function press(element: HTMLElement, label: string) {
      const button = [...reason(element)!.querySelectorAll('button')].find(
        (b) => text(b) === label,
      );
      button!.click();
      await ticked();
      reads()[0]?.flush(none());
      await ticked();
    }

    it('the source holds no spans when its source row counts none', async () => {
      // The recorded source, its spans gone.
      const empty: TelemetrySources = {
        sources: sources().sources!.map((source) => ({ ...source, spans: 0 })),
      };
      const { element } = await shown(none(), '&threshold=500&since=60', empty);
      expect(reason(element)?.dataset['empty']).toBe('no-spans');
      expect(text(reason(element))).toBe(
        'This source holds no spans: it has sent no traces lately.',
      );
    });

    it('the service is not one of the source’s, pointing at All services', async () => {
      const { element } = await shown(none(), '&service=elsewhere&threshold=500');
      expect(reason(element)?.dataset['empty']).toBe('unknown-service');
      expect(text(reason(element))).toContain(
        'No service called elsewhere has reported into this source.',
      );
      await press(element, 'All services');
      expect(TestBed.inject(Router).url).not.toContain('service=');
    });

    it('none reaches the floor, pointing at Any duration', async () => {
      const { element } = await shown(none(), '&threshold=1000&service=qits-example');
      expect(reason(element)?.dataset['empty']).toBe('below-floor');
      expect(text(reason(element))).toContain(
        'No trace of this source involving qits-example took 1 s or longer.',
      );
      await press(element, 'Any duration');
      expect(TestBed.inject(Router).url).not.toContain('threshold=');
    });

    it('none falls in the time range, pointing at clearing it', async () => {
      const { element } = await shown(none(), '&since=15');
      expect(reason(element)?.dataset['empty']).toBe('outside-window');
      expect(text(reason(element))).toContain('No trace of this source falls in this time range.');
      await press(element, 'Everything buffered');
      expect(TestBed.inject(Router).url).not.toContain('since=');
    });

    it('else simply none', async () => {
      const { element } = await shown(none());
      expect(reason(element)?.dataset['empty']).toBe('none');
      expect(text(reason(element))).toBe('No trace of this source is buffered.');
    });
  });

  it('says a refusal needs qits:admin, and shows no traces section', async () => {
    await TestBed.inject(Router).navigateByUrl('/?source=_service%2Fqits-example');
    const fixture = TestBed.createComponent(ObservabilityTracesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(sources());
    reads()[0].flush(null, { status: 403, statusText: 'Forbidden' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const alert = element.querySelector('[role="alert"]');
    expect(alert?.classList).not.toContain('hidden');
    expect(text(alert)).toBe('Reading telemetry needs qits:admin.');
    expect(element.querySelector('section[aria-label="Traces"]')?.classList).toContain('hidden');
  });

  it('offers Retry when the traces could not be read, and reads again on it', async () => {
    await TestBed.inject(Router).navigateByUrl('/?source=_service%2Fqits-example');
    const fixture = TestBed.createComponent(ObservabilityTracesPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(sources());
    reads()[0].flush(null, { status: 500, statusText: 'Server Error' });
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const failure = element.querySelector('section[aria-label="Traces"] ui-load-failure');
    expect(failure?.classList).not.toContain('hidden');
    expect(text(failure)).toContain('This source’s traces could not be read.');
    const retry = [...failure!.querySelectorAll('button')].find((b) => text(b) === 'Retry');
    retry!.click();
    await ticked();
    const again = reads();
    expect(again).toHaveLength(1);
    again[0].flush(recorded());
    await ticked();
  });
});
