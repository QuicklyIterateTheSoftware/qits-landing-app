import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's Traces page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `listTelemetryTraces` are answered from qits-observability's golden
 * masters: "telemetry from one platform service" (one SERVICE source, `_service/qits-example`, its
 * one service the same, and its traces newest first: `GET /health`, route `/health`, 5 ms, 1 span,
 * then `GET /invoices`, route `/invoices`, 750 ms, 2 spans, 1 error span and an exception; each
 * trace id links the trace page, `open-telemetry-trace`) and "an empty telemetry buffer" (no
 * source). The recording answers the default read only (the source
 * alone), so the other lenses, the flat view, a truncated answer and the empty reasons are the
 * plain spec's (`observability-traces.page.spec.ts`) and `traces.spec.ts`'s; a screenshot shows
 * only a recorded body, so the empty state is the empty buffer's. A refusal is a 403 with no body,
 * as the service answers a credential without a telemetry role.
 */
describe('ObservabilityTracesPage (screenshots)', () => {
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
  const TRACES = '/observability/api/telemetry/traces';

  /** The open reads of `url`. */
  const reads = (url: string): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === url).filter((r) => !r.cancelled);

  /** The query `read` was sent with, as name → value. */
  const params = (read: TestRequest): Record<string, string> =>
    Object.fromEntries(new URL(read.request.urlWithParams, 'http://x').searchParams);

  const recordedSource = async () =>
    (await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability')).sources[0]
      .key as string;

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/traces${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the open sources read with the recorded source. */
  async function answerSources() {
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
  }

  /** Answers the one open traces read with the recorded traces; the read. */
  async function answerTraces() {
    const open = reads(TRACES);
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(ONE_SERVICE, 'listTelemetryTraces', 'qits-observability'));
    return open[0];
  }

  /** The page with the recorded source chosen, its sources and traces answered. */
  async function loaded() {
    const source = await recordedSource();
    const rendered = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    const read = await answerTraces();
    expect(params(read)).toEqual({ source });
    await rendered.opened.settled();
    const traces = rendered.view.getByRole('region', { name: 'Traces' });
    return { ...rendered, source, traces };
  }

  it('shows a source’s traces newest first, grouped by path', async () => {
    const { opened, view, traces } = await loaded();
    await expect
      .element(view.getByRole('list', { name: 'Services' }))
      .toMatchTextContent('qits-example');
    const paths = traces.getByRole('list', { name: 'Paths' });
    const health = paths.getByRole('listitem', { name: '/health' });
    await expect.element(health).toMatchTextContent('1 trace');
    await expect.element(health).toMatchTextContent('slowest 5 ms');
    const invoices = paths.getByRole('listitem', { name: '/invoices' });
    await expect.element(invoices).toMatchTextContent('slowest 750 ms');
    await expect.element(invoices).toMatchTextContent('1 errored');
    await expect.element(invoices).toMatchTextContent('exception');
    await expect.element(invoices).toMatchTextContent('2026-01-01 00:00:00.000');
    // Open the errored path: its one trace below it.
    await invoices.getByRole('button', { name: '/invoices' }).click();
    await opened.idle();
    const trace = invoices.getByRole('listitem', { name: 'GET /invoices' });
    await expect.element(trace).toMatchTextContent('750 ms');
    await expect.element(trace).toMatchTextContent('1 error');
    await expect.element(trace).toMatchTextContent('2 spans');
    await expect
      .element(trace.getByRole('link', { name: 'trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=${encodeURIComponent(await recordedSource())}`,
      );
    await opened.settled();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('open-telemetry-trace trace: a trace’s id opens the trace at the same source', async () => {
    const { opened, traces, source } = await loaded();
    const invoices = traces
      .getByRole('list', { name: 'Paths' })
      .getByRole('listitem', { name: '/invoices' });
    await invoices.getByRole('button', { name: '/invoices' }).click();
    await opened.idle();
    await invoices
      .getByRole('listitem', { name: 'GET /invoices' })
      .getByRole('link', { name: /^trace / })
      .click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-telemetry-trace:trace',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=${encodeURIComponent(source)}`,
    );
  });

  it('reads no traces before a source is chosen, then the chosen one’s', async () => {
    const { opened, view } = await render();
    await answerSources();
    await opened.settled();
    expect(reads(TRACES)).toHaveLength(0);
    await expect.element(view).toMatchTextContent('Choose a source above to see its traces.');
    // The traces' section stays hidden until a source is chosen.
    expect(opened.page.querySelector('section[aria-label="Traces"]')?.classList).toContain(
      'hidden',
    );
    await view.getByRole('list', { name: 'Services' }).getByRole('link').first().click();
    await opened.idle();
    const read = await answerTraces();
    expect(params(read)).toEqual({ source: await recordedSource() });
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain(
      `source=${encodeURIComponent(await recordedSource())}`,
    );
  });

  it('reads the sources and the traces again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerSources();
    await answerTraces();
    await opened.settled();
  });

  it('offers Retry when the traces could not be read', async () => {
    const source = await recordedSource();
    const { opened, view } = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    reads(TRACES)[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('This source’s traces could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerTraces();
    await opened.settled();
  });

  it('says nothing is buffered when the buffer is empty', async () => {
    const { opened, view } = await render();
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(EMPTY, 'listTelemetrySources', 'qits-observability'));
    await opened.settled();
    expect(reads(TRACES)).toHaveLength(0);
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
    for (const read of reads(TRACES)) {
      read.flush(null, { status: 403, statusText: 'Forbidden' });
    }
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading telemetry needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
