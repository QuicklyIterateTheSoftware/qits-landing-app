import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's Metrics page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `listTelemetryMetrics` are answered from qits-observability's golden
 * masters: "telemetry from one platform service" (one SERVICE source, `_service/qits-example`, and
 * its two series: `http.server.requests`, a COUNTER at 3 with no attributes, and
 * `jvm.memory.used{pool=heap}`, 1.5E8 By, each the only series of its name) and "an empty telemetry
 * buffer" (no source). No recording holds a name with several series, a source with no series or a
 * filter nothing matches, so the bars and those empty states are the plain spec's
 * (`observability-metrics.page.spec.ts`) and `metric-series.spec.ts`'s. A refusal is a 403 with no
 * body, as the service answers a credential without a telemetry role.
 */
describe('ObservabilityMetricsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    // Back to the configured viewport, so the next spec file renders as it always does.
    await page.viewport(800, 600);
  });

  const ONE_SERVICE = 'telemetry from one platform service';
  const EMPTY = 'an empty telemetry buffer';
  const SOURCES = '/observability/api/telemetry/sources';
  const METRICS = '/observability/api/telemetry/metrics';

  /** The open reads of `url`. */
  const reads = (url: string): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === url).filter((r) => !r.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  const recordedSource = async () =>
    (await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability')).sources[0]
      .key as string;

  /** Opens the page at `query`, tall enough for every card (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/metrics${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the open sources read with the recorded source. */
  async function answerSources() {
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
  }

  /** Answers the one open metrics read with the recorded series; the read. */
  async function answerMetrics() {
    const open = reads(METRICS);
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(ONE_SERVICE, 'listTelemetryMetrics', 'qits-observability'));
    return open[0];
  }

  /** The page with the recorded source chosen (and `query`), its sources and metrics answered. */
  async function loaded(query = '') {
    const source = await recordedSource();
    const rendered = await render(`?source=${encodeURIComponent(source)}${query}`);
    await answerSources();
    const read = await answerMetrics();
    expect(param(read, 'source')).toBe(source);
    expect(param(read, 'name')).toBeNull();
    await rendered.opened.settled();
    const metrics = rendered.view.getByRole('region', { name: 'Metrics' });
    return { ...rendered, source, metrics };
  }

  it('shows a source’s metrics, one card per name, each single series a figure', async () => {
    const { opened, view, metrics } = await loaded();
    await expect
      .element(view.getByRole('list', { name: 'Services' }))
      .toMatchTextContent('qits-example');
    await expect
      .element(view)
      .toMatchTextContent(
        'The buffer keeps only the latest value per series, so there is no history to chart.',
      );
    await expect
      .element(metrics)
      .toMatchTextContent(
        '2 series of 2 metrics · latest values as of 2026-01-01 00:00:01.000 UTC',
      );
    const requests = metrics.getByRole('listitem', { name: 'http.server.requests' });
    await expect.element(requests).toMatchTextContent('COUNTER');
    await expect.element(requests).toMatchTextContent('no unit');
    await expect.element(requests.getByText('3', { exact: true })).toBeVisible();
    const memory = metrics.getByRole('listitem', { name: 'jvm.memory.used' });
    await expect.element(memory).toMatchTextContent('GAUGE');
    await expect.element(memory).toMatchTextContent('unit By (bytes)');
    await expect.element(memory).toMatchTextContent('143 MiB');
    await expect.element(memory).toMatchTextContent('pool=heap');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads no metrics before a source is chosen, then the chosen one’s', async () => {
    const { opened, view } = await render();
    await answerSources();
    await opened.settled();
    expect(reads(METRICS)).toHaveLength(0);
    await expect.element(view).toMatchTextContent('Choose a source above to see its metrics.');
    // The metrics' section stays hidden until a source is chosen.
    expect(opened.page.querySelector('section[aria-label="Metrics"]')?.classList).toContain(
      'hidden',
    );
    await view.getByRole('list', { name: 'Services' }).getByRole('link').first().click();
    await opened.idle();
    const read = await answerMetrics();
    expect(param(read, 'source')).toBe(await recordedSource());
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain(
      `source=${encodeURIComponent(await recordedSource())}`,
    );
  });

  it('narrows the cards by name in the browser, without reading again', async () => {
    const { opened, metrics } = await loaded();
    await userEvent.fill(metrics.getByRole('searchbox', { name: /Name contains/ }), 'Memory');
    await userEvent.keyboard('{Enter}');
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('name=Memory');
    expect(reads(METRICS)).toHaveLength(0);
    await expect.element(metrics.getByRole('listitem', { name: 'jvm.memory.used' })).toBeVisible();
    await expect
      .element(metrics.getByRole('listitem', { name: 'http.server.requests' }))
      .not.toBeInTheDocument();
  });

  it('reads the sources and the metrics again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerSources();
    await answerMetrics();
    await opened.settled();
  });

  it('offers Retry when the metrics could not be read', async () => {
    const source = await recordedSource();
    const { opened, view } = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    reads(METRICS)[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('This source’s metrics could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerMetrics();
    await opened.settled();
  });

  it('says nothing is buffered when the buffer is empty', async () => {
    const { opened, view } = await render();
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(EMPTY, 'listTelemetrySources', 'qits-observability'));
    await opened.settled();
    expect(reads(METRICS)).toHaveLength(0);
    await expect.element(view).toMatchTextContent('Nothing is buffered');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs qits:admin', async () => {
    const { opened, view } = await render('?source=_service%2Fqits-example');
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    http.expectOne(SOURCES).flush(null, { status: 403, statusText: 'Forbidden' });
    for (const read of reads(METRICS)) read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading telemetry needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
