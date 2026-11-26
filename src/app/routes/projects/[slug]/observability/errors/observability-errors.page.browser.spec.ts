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
 * Screenshots of the Observability section's Errors page inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists").
 *
 * `listErrorIssues` is answered from qits-observability's golden masters, "stored error issues"
 * (qits-2538): two OPEN issues of `qits-example`, an `IllegalStateException` at
 * `eu.example.InvoiceResource.list` seen three times and a log's message seen once. No recording
 * holds an empty list, a regressed or dismissed issue or a truncated answer, so those are the plain
 * spec's (`observability-errors.page.spec.ts`); the DISMISSED lens is checked by what it sends. A
 * refusal is a 403 with no body, as the service answers a credential without a telemetry role.
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

  const STORED = 'stored error issues';
  const ISSUES = '/observability/api/error-issues';
  const OBS = 'qits-observability';
  const FINGERPRINT = '0123456789abcdef0123456789abcdef';

  /** The open issue reads. */
  const reads = (): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === ISSUES).filter((r) => !r.cancelled);

  /** A query parameter of `read`: the client writes the query into the URL. */
  const param = (read: TestRequest | undefined, name: string) =>
    read ? new URL(read.request.urlWithParams, 'http://x').searchParams.get(name) : undefined;

  /** Opens the page at `query`, tall enough for every row (a screenshot shows the viewport only). */
  async function render(query = '') {
    await page.viewport(1140, 1000);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/errors${query}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the one open issues read with the recorded issues; the read. */
  async function answerIssues() {
    const open = reads();
    expect(open).toHaveLength(1);
    open[0].flush(await goldenMaster(STORED, 'listErrorIssues', OBS));
    return open[0];
  }

  /** The page as it opens, the open issues answered. */
  async function loaded() {
    const rendered = await render();
    const read = await answerIssues();
    expect(param(read, 'state')).toBeNull();
    expect(param(read, 'service')).toBeNull();
    expect(param(read, 'limit')).toBeNull();
    await rendered.opened.settled();
    const issues = rendered.view.getByRole('region', { name: 'Error issues' });
    return { ...rendered, issues };
  }

  it('lists the open error issues, each titled by its exception or message', async () => {
    const { opened, issues } = await loaded();
    const rows = issues.getByRole('listitem');
    await expect
      .element(rows.nth(0))
      .toMatchTextContent('nightly export finished with <n> failures');
    await expect.element(rows.nth(0)).toMatchTextContent('qits-example');
    await expect
      .element(rows.nth(1))
      .toMatchTextContent('IllegalStateException: invoice store unreachable');
    await expect.element(rows.nth(1)).toMatchTextContent('eu.example.InvoiceResource.list');
    await expect.element(rows.nth(1)).toMatchTextContent('3×');
    await expect
      .element(rows.nth(1).getByRole('link'))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/errors/${FINGERPRINT}`,
      );
    await expect
      .element(issues.getByRole('button', { name: 'Open' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('reads the dismissed issues when Dismissed is chosen, in the URL', async () => {
    const { opened, issues } = await loaded();
    await issues.getByRole('button', { name: 'Dismissed' }).click();
    await opened.idle();
    const read = await answerIssues();
    expect(param(read, 'state')).toBe('DISMISSED');
    await opened.settled();
    expect(TestBed.inject(Router).url).toContain('state=DISMISSED');
  });

  it('reads one service’s issues at ?service=, and Clear drops it', async () => {
    const { opened } = await render('?service=qits-example');
    const read = await answerIssues();
    expect(param(read, 'service')).toBe('qits-example');
    await opened.settled();
    const filter = page.elementLocator(opened.page.querySelector('[data-service-filter]')!);
    await expect.element(filter).toMatchTextContent('qits-example');
    await filter.getByRole('button', { name: 'Clear' }).click();
    await opened.idle();
    expect(param(await answerIssues(), 'service')).toBeNull();
    await opened.settled();
    expect(TestBed.inject(Router).url).not.toContain('service=');
  });

  it('reads the issues again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerIssues();
    await opened.settled();
  });

  it('offers Retry when the issues could not be read', async () => {
    const { opened, view } = await render();
    reads()[0]?.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view).toMatchTextContent('The error issues could not be read.');
    await view.getByRole('button', { name: 'Retry' }).click();
    await opened.idle();
    await answerIssues();
    await opened.settled();
  });

  it('open-error-issue issue: a row opens its issue’s page', async () => {
    const { opened, issues } = await loaded();
    await issues.getByRole('link', { name: /IllegalStateException/ }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-error-issue:issue',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/errors/${FINGERPRINT}`,
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
      .toMatchTextContent('Reading error issues needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
