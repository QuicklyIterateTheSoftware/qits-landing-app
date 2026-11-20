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
 * Screenshots of the Observability section's Slow spans page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `listSlowSpans` are answered from qits-observability's golden masters:
 * "telemetry from one platform service" (one SERVICE source, `_service/qits-example`, and its spans
 * at or above 500 ms, slowest first: `GET /invoices`, SERVER, 750 ms, ERROR with an exception event
 * and `http.route=/invoices`, and `SELECT invoices`, CLIENT, 600 ms, UNSET; each trace id links the
 * trace page, `open-telemetry-trace`) and "an empty telemetry
 * buffer" (no source). No recording holds a truncated answer, an empty one, another floor, order or
 * time range, so those are the plain spec's (`observability-slow-spans.page.spec.ts`) and
 * `slow-spans.spec.ts`'s. A refusal is a 403 with no body, as the service answers a credential
 * without a telemetry role.
 */
describe('ObservabilitySlowSpansPage (screenshots)', () => {
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
  const SLOW_SPANS = '/observability/api/telemetry/slow-spans';

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
      (project) => `/projects/${project.slug}/observability/slow-spans${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the open sources read with the recorded source. */
  async function answerSources() {
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
  }

  /** Answers the one open slow-spans read with the recorded spans; the read. */
  async function answerSlowSpans() {
    const open = reads(SLOW_SPANS);
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(ONE_SERVICE, 'listSlowSpans', 'qits-observability'));
    return open[0];
  }

  /** The page with the recorded source chosen, its sources and slow spans answered. */
  async function loaded() {
    const source = await recordedSource();
    const rendered = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    const read = await answerSlowSpans();
    expect(params(read)).toEqual({ source, thresholdMs: '500' });
    await rendered.opened.settled();
    const spans = rendered.view.getByRole('region', { name: 'Slow spans' });
    return { ...rendered, source, spans };
  }

  it('shows a source’s spans at or above 500 ms, slowest first', async () => {
    const { opened, view, spans } = await loaded();
    await expect
      .element(view.getByRole('list', { name: 'Services' }))
      .toMatchTextContent('qits-example');
    const invoices = spans.getByRole('listitem', { name: 'GET /invoices' });
    await expect.element(invoices).toMatchTextContent('750 ms');
    await expect.element(invoices).toMatchTextContent('SERVER');
    await expect.element(invoices).toMatchTextContent('/invoices');
    await expect.element(invoices).toMatchTextContent('ERROR');
    await expect.element(invoices).toMatchTextContent('exception');
    await expect.element(invoices).toMatchTextContent('2026-01-01 00:00:00.000');
    await expect.element(invoices).toMatchTextContent('2026.1231.120000');
    await expect
      .element(invoices.getByRole('link', { name: 'trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=${encodeURIComponent(await recordedSource())}`,
      );
    const select = spans.getByRole('listitem', { name: 'SELECT invoices' });
    await expect.element(select).toMatchTextContent('600 ms');
    await expect.element(select).toMatchTextContent('CLIENT');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('open-telemetry-trace trace: a span’s trace id opens the trace at the same source', async () => {
    const { opened, spans, source } = await loaded();
    await spans
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

  it('reads no slow spans before a source is chosen, then the chosen one’s', async () => {
    const { opened, view } = await render();
    await answerSources();
    await opened.settled();
    expect(reads(SLOW_SPANS)).toHaveLength(0);
    await expect.element(view).toMatchTextContent('Choose a source above to see its slow spans.');
    // The spans' section stays hidden until a source is chosen.
    expect(opened.page.querySelector('section[aria-label="Slow spans"]')?.classList).toContain(
      'hidden',
    );
    await view.getByRole('list', { name: 'Services' }).getByRole('link').first().click();
    await opened.idle();
    const read = await answerSlowSpans();
    expect(params(read)).toEqual({ source: await recordedSource(), thresholdMs: '500' });
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain(
      `source=${encodeURIComponent(await recordedSource())}`,
    );
  });

  it('reads the sources and the slow spans again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerSources();
    await answerSlowSpans();
    await opened.settled();
  });

  it('offers Retry when the slow spans could not be read', async () => {
    const source = await recordedSource();
    const { opened, view } = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    reads(SLOW_SPANS)[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('This source’s slow spans could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerSlowSpans();
    await opened.settled();
  });

  it('says nothing is buffered when the buffer is empty', async () => {
    const { opened, view } = await render();
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(EMPTY, 'listTelemetrySources', 'qits-observability'));
    await opened.settled();
    expect(reads(SLOW_SPANS)).toHaveLength(0);
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
    for (const read of reads(SLOW_SPANS)) {
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
