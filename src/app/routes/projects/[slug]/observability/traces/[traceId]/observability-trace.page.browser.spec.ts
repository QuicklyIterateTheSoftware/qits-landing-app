import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's trace page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `getTelemetryTrace` is answered from qits-observability's golden master "telemetry from one
 * platform service": trace `6a1f0c2b9d8e47f3a5b4c3d2e1f00a01` of `_service/qits-example`, a
 * `GET /invoices` SERVER span (750 ms, ERROR, an exception event, the root) over a `SELECT
 * invoices` CLIENT span (600 ms), and two logs written in the root. "an empty telemetry buffer"
 * (from `@qits/observability-golden-masters` 2026.1120.180009 on) records the same trace id with no
 * spans and no logs, so it is this page's empty shot, after the `getTelemetryStore` read that
 * follows an empty trace (also recorded there, nothing evicted). A missing root, an orphan or a
 * cycle are not recorded anywhere: those stay the plain spec's (`observability-trace.page.spec.ts`)
 * and `trace-layout.spec.ts`'s. The page without a source reads nothing, which is its own no-data
 * shot (`no-source`). A refusal is a 403 with no body, as the service answers a credential without
 * a telemetry role.
 */
describe('ObservabilityTracePage (screenshots)', () => {
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
  const TRACES = '/observability/api/telemetry/traces/';
  const STORE = '/observability/api/telemetry/store';
  const SOURCE = '_service/qits-example';
  const TRACE_ID = '6a1f0c2b9d8e47f3a5b4c3d2e1f00a01';

  /** The open trace reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url.startsWith(TRACES)).filter((r) => !r.cancelled);

  /** The open store reads (made only after an empty trace answers). */
  const storeReads = (): TestRequest[] =>
    http.match((request) => request.url.startsWith(STORE)).filter((r) => !r.cancelled);

  /** The query `read` was sent with, as name → value. */
  const params = (read: TestRequest): Record<string, string> =>
    Object.fromEntries(new URL(read.request.urlWithParams, 'http://x').searchParams);

  /** Opens the trace page at `query` (the recorded source by default). */
  async function render(query = `?source=${encodeURIComponent(SOURCE)}`) {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/traces/${TRACE_ID}${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the one open trace read with the recorded trace; the read. */
  async function answerTrace() {
    const open = reads();
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(ONE_SERVICE, 'getTelemetryTrace', 'qits-observability'));
    return open[0];
  }

  /**
   * Makes the viewport tall enough for the whole page, measured at the phone's width, where it
   * is tallest: there the document scrolls and the frame grows with the page.
   */
  async function fitWholePage(opened: OpenedRoute) {
    const width = window.innerWidth;
    await page.viewport(390, 844);
    await opened.settled();
    const height = opened.frame.scrollHeight;
    await page.viewport(width, Math.max(height, 900) + 40);
    await opened.settled();
  }

  /** The page with the recorded trace answered. */
  async function loaded(query?: string) {
    const rendered = await render(query);
    const read = await answerTrace();
    expect(read.request.url.split('?')[0]).toBe(`${TRACES}${TRACE_ID}`);
    expect(params(read)).toEqual({ source: SOURCE });
    await rendered.opened.settled();
    return rendered;
  }

  it('shows the recorded trace: the waterfall, the root’s detail and the logs', async () => {
    const { opened, view } = await loaded();
    await expect.element(view).toMatchTextContent(TRACE_ID);
    await expect.element(view).toMatchTextContent('2 spans · 1 service · 750 ms · 1 error span');
    const waterfall = view.getByRole('region', { name: 'Waterfall' });
    const root = waterfall.getByRole('button', { name: 'GET /invoices' });
    await expect.element(root).toMatchTextContent('qits-example');
    await expect.element(root).toMatchTextContent('ERROR');
    await expect.element(root).toMatchTextContent('exception');
    await expect.element(root).toMatchTextContent('2 logs');
    await expect.element(root).toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(waterfall.getByRole('button', { name: 'SELECT invoices' }))
      .toMatchTextContent('600 ms');
    const detail = view.getByRole('region', { name: 'Span detail' });
    await expect
      .element(detail)
      .toMatchTextContent('java.lang.IllegalStateException: invoice store unreachable');
    await expect.element(detail).toMatchTextContent('2026.1231.120000');
    const logs = view.getByRole('region', { name: 'Correlated logs' });
    await expect.element(logs).toMatchTextContent('listing invoices');
    await expect.element(logs).toMatchTextContent('in GET /invoices');
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('shows a chosen span’s detail, in ?span=, without reading again', async () => {
    const { opened, view } = await loaded();
    const waterfall = view.getByRole('region', { name: 'Waterfall' });
    await waterfall.getByRole('button', { name: 'SELECT invoices' }).click();
    await opened.settled();
    expect(reads()).toHaveLength(0);
    expect(TestBed.inject(Router).url).toContain('span=7b2e1d3c4f5a6b02');
    const detail = view.getByRole('region', { name: 'Span detail' });
    await expect
      .element(detail.getByRole('heading', { level: 2 }))
      .toHaveTextContent('SELECT invoices');
    await expect.element(detail).toMatchTextContent('CLIENT');
    await expect.element(detail).toMatchTextContent('+50 ms');
  });

  it('reads the trace again on Refresh, keeping the chosen span', async () => {
    const { opened, view } = await loaded(
      `?source=${encodeURIComponent(SOURCE)}&span=7b2e1d3c4f5a6b02`,
    );
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerTrace();
    await opened.settled();
    await expect
      .element(view.getByRole('region', { name: 'Span detail' }).getByRole('heading', { level: 2 }))
      .toHaveTextContent('SELECT invoices');
  });

  it('offers Retry when the trace could not be read', async () => {
    const { opened, view } = await render();
    reads()[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('This trace could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerTrace();
    await opened.settled();
  });

  it('shows an empty trace from its recording, after reading the store, without eviction', async () => {
    const { opened, view } = await render();
    const open = reads();
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(EMPTY, 'getTelemetryTrace', 'qits-observability'));
    await opened.idle();
    const store = storeReads();
    expect(store).toHaveLength(1);
    store[0].flush(await goldenMaster(EMPTY, 'getTelemetryStore', 'qits-observability'));
    await opened.settled();
    await expect
      .element(view)
      .toMatchTextContent('No spans of this trace are buffered in this source.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('reads nothing without a source, and says where to choose one', async () => {
    const { opened, view } = await render('');
    await opened.settled();
    expect(reads()).toHaveLength(0);
    await expect.element(view).toMatchTextContent('No source is chosen');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-source', { kind: 'NO_DATA' });
  });

  it('open-telemetry-slow-spans slowSpans: without a source, the Slow spans page', async () => {
    const { opened, view } = await render('');
    await opened.settled();
    await view.getByRole('link', { name: 'Choose a source on the Slow spans page' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-telemetry-slow-spans:slowSpans',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/slow-spans`,
    );
  });

  it('marks the page as loading, then says a refusal needs qits:admin', async () => {
    const { opened, view } = await render();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    for (const read of reads()) read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading telemetry needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
