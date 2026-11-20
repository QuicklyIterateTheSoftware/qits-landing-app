import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { client as observabilityClient } from '../../../../../api/observability/client.gen';
import { provideHeyApiClient } from '../../../../../api/observability/client/client.gen';
import type {
  TelemetryMetricPoint,
  TelemetryMetrics,
} from '$core/observability/observability.consumes';
import { observabilityGoldenMasters } from '../../../../../../testing/golden-masters';
import { ObservabilityMetricsPage } from './observability-metrics.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const ONE_SERVICE = 'telemetry from one platform service';
const SOURCES = '/observability/api/telemetry/sources';
const METRICS = '/observability/api/telemetry/metrics';

/** The recorded answer: `http.server.requests` (3, no attributes) and `jvm.memory.used{pool=heap}`. */
const recorded = (): TelemetryMetrics =>
  observabilityGoldenMasters.body<TelemetryMetrics>(ONE_SERVICE, 'listTelemetryMetrics');

/** The recorded `jvm.memory.used` series. */
const memory = (): TelemetryMetricPoint =>
  recorded().metrics!.find((metric) => metric.name === 'jvm.memory.used')!;

/**
 * The Metrics page (qits-2340) on answers no recording holds, so a screenshot cannot show them, each
 * derived from qits-observability's recorded series ("telemetry from one platform service"): a name
 * with several series (`jvm.memory.used` over four pools, one of them zero), which is drawn as bars
 * rather than as a figure; a source with no series; and a name filter nothing matches.
 */
describe('ObservabilityMetricsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(observabilityClient),
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

  /** The page at `?source=_service/qits-example` (and `query`), its metrics `answer`. */
  async function shown(answer: TelemetryMetrics, query = '') {
    await TestBed.inject(Router).navigateByUrl(`/?source=_service%2Fqits-example${query}`);
    const fixture = TestBed.createComponent(ObservabilityMetricsPage);
    fixture.detectChanges();
    await ticked();
    http.expectOne(SOURCES).flush(null, { status: 404, statusText: 'Not Found' });
    const reads = http.match((request) => request.url.split('?')[0] === METRICS);
    expect(reads).toHaveLength(1);
    expect(reads[0].request.urlWithParams).not.toContain('name=');
    reads[0].flush(answer);
    await ticked();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const cards = [
      ...element.querySelectorAll<HTMLElement>('section[aria-label="Metrics"] ol > li'),
    ];
    return { fixture, element, cards };
  }

  /** `jvm.memory.used` over four pools, one of them zero, in export order (not key order). */
  const pools = (): TelemetryMetrics => ({
    metrics: [
      recorded().metrics![0],
      { ...memory(), value: 5e7, attributes: { pool: 'survivor' } },
      { ...memory(), value: 2e8, attributes: { pool: 'old' } },
      { ...memory(), value: 0, attributes: { pool: 'eden' } },
      memory(),
    ],
  });

  it('draws a name with several series as one bar per series, sorted, against the largest', async () => {
    const { cards, element } = await shown(pools());
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'http.server.requests',
      'jvm.memory.used',
    ]);
    const [requests, used] = cards;
    expect(requests.querySelector('[data-bars]')).toBeNull();
    expect(requests.querySelector('[data-figure]')?.textContent?.trim()).toBe('3');

    expect(used.querySelector('[data-figure]')).toBeNull();
    const bars = [...used.querySelectorAll<HTMLElement>('[data-bar]')];
    // Each bar: its attributes, then its value.
    const text = (bar: HTMLElement) =>
      [...bar.children]
        .map((child) => child.textContent?.trim())
        .filter(Boolean)
        .join(' ');
    expect(bars.map(text)).toEqual([
      'pool=eden 0 B',
      'pool=heap 143 MiB',
      'pool=old 191 MiB',
      'pool=survivor 47.7 MiB',
    ]);
    expect(bars.map((bar) => bar.querySelector<HTMLElement>('[data-fill]')?.style.width)).toEqual([
      '0%',
      '75%',
      '100%',
      '25%',
    ]);
    expect(used.textContent).toContain('unit By (bytes)');
    expect(element.querySelector('[data-as-of]')?.textContent).toContain(
      '5 series of 2 metrics · latest values as of 2026-01-01 00:00:01.000 UTC',
    );
  });

  it('says the source holds no metric series when the answer is empty', async () => {
    const { element, cards } = await shown({ metrics: [] });
    expect(cards).toHaveLength(0);
    expect(element.querySelector('[data-no-series]')?.classList).toContain('block');
    expect(element.querySelector('[data-no-match]')?.classList).toContain('hidden');
  });

  it('narrows the cards by ?name= in any case, in the browser, and says when none matches', async () => {
    const narrowed = await shown(pools(), '&name=MEMORY');
    expect(narrowed.cards.map((card) => card.getAttribute('aria-label'))).toEqual([
      'jvm.memory.used',
    ]);
    narrowed.fixture.destroy();

    const { element, cards } = await shown(pools(), '&name=nothing');
    expect(cards).toHaveLength(0);
    expect(element.querySelector('[data-no-series]')?.classList).toContain('hidden');
    expect(element.querySelector('[data-no-match]')?.classList).toContain('block');
    expect(element.querySelector('[data-no-match]')?.textContent).toContain(
      'No metric name contains “nothing”.',
    );
  });
});
