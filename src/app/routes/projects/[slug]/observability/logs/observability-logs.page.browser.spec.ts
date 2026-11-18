import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's Logs page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `searchTelemetryLogs` are answered from qits-observability's golden
 * masters: "telemetry from one platform service" (one SERVICE source, `_service/qits-example`, and
 * its two log lines, an INFO and a later ERROR), "telemetry records of every kind" (the same
 * source's lines of the last hour) and "an empty telemetry buffer" (no source). A
 * refusal is a 403 with no body, as the service answers a credential without a telemetry role.
 */
describe('ObservabilityLogsPage (screenshots)', () => {
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
  const EVERY_KIND = 'telemetry records of every kind';
  const SOURCES = '/observability/api/telemetry/sources';
  const LOGS = '/observability/api/telemetry/logs';

  /** The open logs reads. */
  const logsReads = (): TestRequest[] =>
    http
      .match((request) => request.url.split('?')[0] === LOGS)
      .filter((request) => !request.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/logs${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** The page with the recorded source chosen, its sources and logs answered. */
  async function loaded() {
    const source = (await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'))
      .sources[0].key as string;
    const rendered = await render(`?source=${encodeURIComponent(source)}`);
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
    const [logs] = logsReads();
    expect(param(logs, 'source')).toBe(source);
    logs?.flush(await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', 'qits-observability'));
    await rendered.opened.settled();
    return { ...rendered, source };
  }

  it('shows a source’s log lines newest first, with its counts and reach', async () => {
    const { opened, view } = await loaded();
    const services = view.getByRole('list', { name: 'Services' });
    await expect.element(services).toMatchTextContent('qits-example');
    await expect.element(services).toMatchTextContent('2 log lines · 3 spans · 2 metric series');
    await expect.element(services).toMatchTextContent('since 2026-01-01 00:00 UTC');
    const lines = view.getByRole('region', { name: 'Log lines' }).getByRole('listitem');
    await expect.element(lines.nth(0)).toMatchTextContent('invoice store unreachable');
    await expect.element(lines.nth(0)).toMatchTextContent('2026-01-01 00:00:00.700');
    await expect.element(lines.nth(0)).toMatchTextContent('2026.1231.120000');
    await expect.element(lines.nth(1)).toMatchTextContent('listing invoices');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads the logs again from WARN up when the level is WARN', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Level/ }), 'WARN');
    await opened.idle();
    const [warn] = logsReads();
    expect(param(warn, 'minSeverity')).toBe('WARN');
    warn?.flush(await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', 'qits-observability'));
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('level=WARN');
  });

  it('reads the last hour’s logs when the time range is the last hour', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Time range/ }), '60');
    await opened.idle();
    const [hour] = logsReads();
    expect(param(hour, 'sinceMinutes')).toBe('60');
    hour?.flush(await goldenMaster(EVERY_KIND, 'searchTelemetryLogs', 'qits-observability'));
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('since=60');
    await expect
      .element(view.getByRole('region', { name: 'Log lines' }))
      .toMatchTextContent('invoice store unreachable');
  });

  it('opens the section’s address on the Logs page, keeping the query', async () => {
    const source = '_service/qits-example';
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability?source=${encodeURIComponent(source)}`,
    );
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/logs?source=${encodeURIComponent(source)}`,
    );
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', 'qits-observability'));
    logsReads()[0]?.flush(
      await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', 'qits-observability'),
    );
    await opened.settled();
  });

  it('says nothing is buffered when the buffer is empty', async () => {
    const { opened, view } = await render();
    http
      .expectOne(SOURCES)
      .flush(await goldenMaster(EMPTY, 'listTelemetrySources', 'qits-observability'));
    await opened.settled();
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
    for (const logs of logsReads()) logs.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading telemetry needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
