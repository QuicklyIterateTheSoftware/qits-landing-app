import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { page, userEvent } from 'vitest/browser';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Observability section's Logs page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listTelemetrySources` and `searchTelemetryLogs` are answered from qits-observability's golden
 * masters: "telemetry from two platform services" (two SERVICE sources, `_service/qits-example`
 * and `_service/qits-other`, and the merged tail: qits-example's INFO and ERROR in one trace and
 * qits-other's WARN between them, in no trace), "telemetry from one platform service" (one source
 * and its two lines, as an old `?source=` link reads them), "telemetry records of every kind" (the
 * same source's lines of the last hour), "stored error issues" (qits-2538: one error issue's
 * ERROR line by its fingerprint, carrying `qits.error.fingerprint`) and "an empty telemetry
 * buffer" (no source, no line). A
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

  const TWO = 'telemetry from two platform services';
  const ONE_SERVICE = 'telemetry from one platform service';
  const EMPTY = 'an empty telemetry buffer';
  const EVERY_KIND = 'telemetry records of every kind';
  const SOURCES = '/observability/api/telemetry/sources';
  const LOGS = '/observability/api/telemetry/logs';
  const OBS = 'qits-observability';
  const STORED = 'stored error issues';
  const FINGERPRINT = '0123456789abcdef0123456789abcdef';

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

  /** The page as it opens: every source merged, its sources and logs answered. */
  async function loaded(query = '') {
    const rendered = await render(query);
    http.expectOne(SOURCES).flush(await goldenMaster(TWO, 'listTelemetrySources', OBS));
    const [logs] = logsReads();
    expect(param(logs, 'source')).toBeNull();
    logs?.flush(await goldenMaster(TWO, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    return rendered;
  }

  it('shows every service’s log lines merged, newest first, each naming its service', async () => {
    const { opened, view } = await loaded();
    const lines = view.getByRole('region', { name: 'Log lines' }).getByRole('listitem');
    await expect.element(lines.nth(0)).toMatchTextContent('invoice store unreachable');
    await expect.element(lines.nth(0)).toMatchTextContent('qits-example');
    await expect.element(lines.nth(0)).toMatchTextContent('2026-01-01 00:00:00.700');
    await expect.element(lines.nth(0)).toMatchTextContent('2026.1231.120000');
    await expect.element(lines.nth(0)).toMatchTextContent('trace 6a1f0c2b');
    await expect.element(lines.nth(1)).toMatchTextContent('cache miss rate high');
    await expect.element(lines.nth(1)).toMatchTextContent('qits-other');
    await expect.element(lines.nth(2)).toMatchTextContent('listing invoices');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('narrows the stream to one service, in the URL, when a service is chosen', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Service/ }), 'qits-other');
    await opened.idle();
    const [narrowed] = logsReads();
    expect(param(narrowed, 'service')).toBe('qits-other');
    expect(param(narrowed, 'source')).toBeNull();
    narrowed?.flush(await goldenMaster(TWO, 'searchTelemetryLogs', OBS));
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('service=qits-other');
  });

  it('reads the logs again from WARN up when the level is WARN', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Level/ }), 'WARN');
    await opened.idle();
    const [warn] = logsReads();
    expect(param(warn, 'minSeverity')).toBe('WARN');
    warn?.flush(await goldenMaster(TWO, 'searchTelemetryLogs', OBS));
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('level=WARN');
  });

  it('reads the last hour’s logs when the time range is the last hour', async () => {
    const { opened, view } = await loaded();
    await userEvent.selectOptions(view.getByRole('combobox', { name: /Time range/ }), '60');
    await opened.idle();
    const [hour] = logsReads();
    expect(param(hour, 'sinceMinutes')).toBe('60');
    hour?.flush(await goldenMaster(EVERY_KIND, 'searchTelemetryLogs', OBS));
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('since=60');
    await expect
      .element(view.getByRole('region', { name: 'Log lines' }))
      .toMatchTextContent('invoice store unreachable');
  });

  it('reads one trace’s lines at ?traceId=, and Clear drops it (qits-2535)', async () => {
    const traceId = '6a1f0c2b9d8e47f3a5b4c3d2e1f00a01';
    const rendered = await render(`?traceId=${traceId}`);
    http.expectOne(SOURCES).flush(await goldenMaster(TWO, 'listTelemetrySources', OBS));
    const [traced] = logsReads();
    expect(param(traced, 'traceId')).toBe(traceId);
    traced?.flush(await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    const filter = page.elementLocator(rendered.opened.page.querySelector('[data-trace-filter]')!);
    await expect.element(filter).toMatchTextContent(traceId);
    // No source is named, so its filter is not drawn at all.
    await expect
      .element(page.elementLocator(rendered.opened.page.querySelector('[data-source-filter]')!))
      .not.toBeVisible();
    await expect
      .element(page.elementLocator(rendered.opened.frame))
      .toMatchScreenshot('trace-filter', { kind: 'DATA' });
    await userEvent.click(filter.getByRole('button', { name: 'Clear' }));
    await rendered.opened.idle();
    const [all] = logsReads();
    expect(param(all, 'traceId')).toBeNull();
    all?.flush(await goldenMaster(TWO, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    expect(TestBed.inject(Router).url).not.toContain('traceId');
  });

  it('reads one error issue’s lines at ?fingerprint=, each linking its issue (qits-2538)', async () => {
    const rendered = await render(`?fingerprint=${FINGERPRINT}&level=ERROR`);
    http.expectOne(SOURCES).flush(await goldenMaster(TWO, 'listTelemetrySources', OBS));
    const [issued] = logsReads();
    expect(param(issued, 'fingerprint')).toBe(FINGERPRINT);
    expect(param(issued, 'minSeverity')).toBe('ERROR');
    issued?.flush(await goldenMaster(STORED, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    const filter = page.elementLocator(
      rendered.opened.page.querySelector('[data-fingerprint-filter]')!,
    );
    await expect.element(filter).toMatchTextContent(FINGERPRINT);
    const line = rendered.view.getByRole('region', { name: 'Log lines' }).getByRole('listitem');
    await expect
      .element(line.getByRole('link', { name: 'issue 01234567' }))
      .toHaveAttribute(
        'href',
        `/projects/${rendered.opened.project.slug}/observability/errors/${FINGERPRINT}`,
      );
    await expect
      .element(page.elementLocator(rendered.opened.frame))
      .toMatchScreenshot('fingerprint-filter', { kind: 'DATA' });
    await userEvent.click(filter.getByRole('button', { name: 'Clear' }));
    await rendered.opened.idle();
    const [all] = logsReads();
    expect(param(all, 'fingerprint')).toBeNull();
    all?.flush(await goldenMaster(TWO, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    expect(TestBed.inject(Router).url).not.toContain('fingerprint');
  });

  it('open-log-error-issue issue: a line’s issue link opens its error issue’s page', async () => {
    const rendered = await render(`?fingerprint=${FINGERPRINT}`);
    http.expectOne(SOURCES).flush(await goldenMaster(TWO, 'listTelemetrySources', OBS));
    logsReads()[0]?.flush(await goldenMaster(STORED, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    await rendered.view.getByRole('link', { name: 'issue 01234567' }).click();
    await leftFor(rendered.opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-log-error-issue:issue',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${rendered.opened.project.slug}/observability/errors/${FINGERPRINT}`,
    );
  });

  it('open-telemetry-trace trace: a line’s trace id opens the trace at its own source', async () => {
    const { opened, view } = await loaded();
    const lines = view.getByRole('region', { name: 'Log lines' }).getByRole('listitem');
    await lines.nth(0).getByRole('link', { name: 'trace 6a1f0c2b' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-telemetry-trace:trace',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example`,
    );
  });

  it('still reads one source for an old ?source= link, shown as a filter', async () => {
    const source = '_service/qits-example';
    const rendered = await render(`?source=${encodeURIComponent(source)}`);
    http.expectOne(SOURCES).flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', OBS));
    const [logs] = logsReads();
    expect(param(logs, 'source')).toBe(source);
    logs?.flush(await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', OBS));
    await rendered.opened.settled();
    await expect
      .element(page.elementLocator(rendered.opened.page.querySelector('[data-source-filter]')!))
      .toMatchTextContent(source);
  });

  it('opens the section’s address on the Logs page, keeping the query', async () => {
    const source = '_service/qits-example';
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability?source=${encodeURIComponent(source)}`,
    );
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/logs?source=${encodeURIComponent(source)}`,
    );
    http.expectOne(SOURCES).flush(await goldenMaster(ONE_SERVICE, 'listTelemetrySources', OBS));
    logsReads()[0]?.flush(await goldenMaster(ONE_SERVICE, 'searchTelemetryLogs', OBS));
    await opened.settled();
  });

  it('says no line matches when the buffer is empty', async () => {
    const { opened, view } = await render();
    http.expectOne(SOURCES).flush(await goldenMaster(EMPTY, 'listTelemetrySources', OBS));
    logsReads()[0]?.flush(await goldenMaster(EMPTY, 'searchTelemetryLogs', OBS));
    await opened.settled();
    await expect.element(view).toMatchTextContent('No log lines match.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs qits:admin', async () => {
    const { opened, view } = await render();
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
