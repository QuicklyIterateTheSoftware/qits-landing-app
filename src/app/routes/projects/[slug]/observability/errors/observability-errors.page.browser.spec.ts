import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's Errors page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `listTelemetryErrors` are answered from qits-observability's golden
 * masters: "telemetry from one platform service" (one SERVICE source, `_service/qits-example`, and
 * its one error group: a `GET /invoices` span that threw `IllegalStateException`, and the ERROR log
 * it wrote) and "an empty telemetry buffer" (no source). No recording holds an uncorrelated group,
 * an empty group list or a truncated answer, so those are the plain spec's
 * (`observability-errors.page.spec.ts`). A refusal is a 403 with no body, as the service answers a
 * credential without a telemetry role.
 */
describe('ObservabilityErrorsPage (screenshots)', () => {
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
  const ERRORS = '/observability/api/telemetry/errors';

  /** The open reads of `url`. */
  const reads = (url: string): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === url).filter((r) => !r.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  const recordedSource = async () =>
    (await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability')).sources[0]
      .key as string;

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/errors${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the open sources read with the recorded source. */
  async function answerSources() {
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
  }

  /** Answers the one open errors read with the recorded group; the read. */
  async function answerErrors() {
    const open = reads(ERRORS);
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(ONE_SERVICE, 'listTelemetryErrors', 'qits-observability'));
    return open[0];
  }

  /** The page with the recorded source chosen, its sources and errors answered. */
  async function loaded() {
    const source = await recordedSource();
    const rendered = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    const read = await answerErrors();
    expect(param(read, 'source')).toBe(source);
    expect(param(read, 'sinceMinutes')).toBeNull();
    expect(param(read, 'limit')).toBeNull();
    await rendered.opened.settled();
    const groups = rendered.view.getByRole('region', { name: 'Error groups' });
    return { ...rendered, source, groups };
  }

  it('shows a source’s error groups, headed by the exception, one expanded', async () => {
    const { opened, view, groups, source } = await loaded();
    await expect
      .element(view.getByRole('list', { name: 'Services' }))
      .toMatchTextContent('qits-example');
    const row = groups.getByRole('listitem').first();
    await expect
      .element(row)
      .toMatchTextContent('java.lang.IllegalStateException: invoice store unreachable');
    await expect.element(row).toMatchTextContent('qits-example');
    await expect.element(row).toMatchTextContent('1 error span · 1 error log');
    await expect.element(row).toMatchTextContent('2026-01-01 00:00:00.750');
    await expect.element(row).toMatchTextContent('2026.1231.120000');
    await expect
      .element(row.getByRole('link', { name: 'trace 6a1f0c2b9d8e47f3a5b4c3d2e1f00a01' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=${encodeURIComponent(source)}`,
      );
    await expect
      .element(row.getByRole('link', { name: 'Error logs' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/logs?source=${encodeURIComponent(source)}&level=ERROR`,
      );

    const headline = row.getByRole('button', { name: /IllegalStateException/ });
    await expect.element(headline).toHaveAttribute('aria-expanded', 'false');
    await headline.click();
    await opened.settled();
    await expect.element(headline).toHaveAttribute('aria-expanded', 'true');
    await expect.element(row).toMatchTextContent('Error spans');
    await expect.element(row).toMatchTextContent('GET /invoices');
    await expect.element(row).toMatchTextContent('SERVER');
    await expect.element(row).toMatchTextContent('750 ms');
    await expect.element(row.getByText(/at eu\.example\.InvoiceResource\.list/)).toBeVisible();
    await expect.element(row).toMatchTextContent('2026-01-01 00:00:00.700');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads no errors before a source is chosen, then the chosen one’s', async () => {
    const { opened, view } = await render();
    await answerSources();
    await opened.settled();
    expect(reads(ERRORS)).toHaveLength(0);
    // The groups' section stays hidden until a source is chosen.
    expect(opened.page.querySelector('section[aria-label="Error groups"]')?.classList).toContain(
      'hidden',
    );
    await view.getByRole('list', { name: 'Services' }).getByRole('link').first().click();
    await opened.idle();
    const read = await answerErrors();
    expect(param(read, 'source')).toBe(await recordedSource());
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain(
      `source=${encodeURIComponent(await recordedSource())}`,
    );
  });

  it('reads the last hour’s errors when the time range is the last hour', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Time range/ }), '60');
    await opened.idle();
    const read = await answerErrors();
    expect(param(read, 'sinceMinutes')).toBe('60');
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('since=60');
  });

  it('reads the sources and the errors again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerSources();
    await answerErrors();
    await opened.settled();
  });

  it('offers Retry when the errors could not be read', async () => {
    const source = await recordedSource();
    const { opened, view } = await render(`?source=${encodeURIComponent(source)}`);
    await answerSources();
    reads(ERRORS)[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('This source’s errors could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerErrors();
    await opened.settled();
  });

  it('open-telemetry-error-logs logs: a group’s Error logs opens the source’s ERROR lines', async () => {
    const { opened, groups, source } = await loaded();
    await groups.getByRole('link', { name: 'Error logs' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-telemetry-error-logs:logs',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/logs?source=${encodeURIComponent(source)}&level=ERROR`,
    );
  });

  it('open-telemetry-trace trace: a group’s trace id opens the trace at the same source', async () => {
    const { opened, groups, source } = await loaded();
    await groups.getByRole('link', { name: /^trace / }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-telemetry-trace:trace',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=${encodeURIComponent(source)}`,
    );
  });

  it('says nothing is buffered when the buffer is empty', async () => {
    const { opened, view } = await render();
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(EMPTY, 'listTelemetrySources', 'qits-observability'));
    await opened.settled();
    expect(reads(ERRORS)).toHaveLength(0);
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
    for (const read of reads(ERRORS)) read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading telemetry needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
