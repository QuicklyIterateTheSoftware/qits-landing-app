import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRoute, provideAppRoute } from '../../../../../../../testing/browser/app-route';
import { leftFor } from '../../../../../../../testing/browser/contracts-bundles';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

/**
 * Screenshots of one stored error issue's page inside the shell (`openRoute`), at the recorded
 * project's slug (qits-projects' "a project exists").
 *
 * `getErrorIssue` and `dismissErrorIssue` are answered from qits-observability's golden masters,
 * "stored error issues" (qits-2538): the OPEN `IllegalStateException` of `qits-example`, three
 * occurrences in one hour, with a sample trace and stack trace, and the same issue DISMISSED. No
 * recording holds a regressed issue or one without a sample trace, so those are the plain spec's
 * (`observability-error.page.spec.ts`). A refusal is a 403 with no body, as the service answers a
 * credential without the role; an unknown fingerprint a 404.
 *
 * The issue's Tickets (qits-2538) come from qits-projects' "a ticket made from an error issue",
 * whose `listProjectWork?errorIssue=` names the same fingerprint (one REPORTED bug), and none from
 * "a project with no work"'s empty list. Its two exits, a ticket's link and Make ticket, are
 * followed once each; the page they leave for is not this spec's (`leftFor`).
 */
describe('ObservabilityErrorPage (screenshots)', () => {
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
  const OBS = 'qits-observability';
  const FINGERPRINT = '0123456789abcdef0123456789abcdef';
  const ISSUE = `/observability/api/error-issues/${FINGERPRINT}`;
  const DISMISS = `${ISSUE}/dismiss`;
  /** qits-projects' tickets made from the issue, and a project with none. */
  const FROM_ISSUE = 'a ticket made from an error issue';
  const NO_WORK = 'a project with no work';

  /** The open reads (or writes) of `url`. */
  const open = (url: string): TestRequest[] =>
    http.match((request) => request.url.split('?')[0] === url).filter((r) => !r.cancelled);

  /** Opens the page, tall enough for the whole issue (a screenshot shows the viewport only). */
  async function render() {
    await page.viewport(1140, 1100);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/observability/errors/${FINGERPRINT}`,
    );
    return { opened, view: page.elementLocator(opened.page) };
  }

  /** Answers the one open issue read with the recorded issue; the read. */
  async function answerIssue() {
    const reads = open(ISSUE);
    expect(reads).toHaveLength(1);
    reads[0].flush(await goldenMaster(STORED, 'getErrorIssue', OBS));
    return reads[0];
  }

  /** Whether `request` is the issue's tickets read (`listProjectWork?errorIssue=<fingerprint>`). */
  const isTicketsRead = (request: { urlWithParams: string }) =>
    new URL(request.urlWithParams, 'http://x').searchParams.get('errorIssue') === FINGERPRINT;

  /** Answers the one open tickets read (the issue's fingerprint) from `state`; the read. */
  async function answerTickets(state = FROM_ISSUE) {
    const reads = http.match((request) => isTicketsRead(request)).filter((r) => !r.cancelled);
    expect(reads).toHaveLength(1);
    reads[0].flush(await goldenMaster(state, 'listProjectWork'));
    return reads[0];
  }

  /** The page with the recorded issue shown, and its tickets from `tickets`. */
  async function loaded(tickets = FROM_ISSUE) {
    const rendered = await render();
    const read = await answerIssue();
    expect(read.request.urlWithParams).not.toContain('?');
    await rendered.opened.settled();
    const ticketsRead = await answerTickets(tickets);
    expect(ticketsRead.request.url.split('?')[0]).toBe(
      `/projects/api/projects/${rendered.opened.project.id}/work`,
    );
    await rendered.opened.settled();
    return rendered;
  }

  it('shows the issue: where, when, how often by the hour, and its sample', async () => {
    const { opened, view } = await loaded();
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('IllegalStateException: invoice store unreachable');
    await expect
      .element(view.getByRole('region', { name: 'Where' }))
      .toMatchTextContent('2026.1230.090000 → 2026.1231.120000');
    await expect
      .element(view.getByRole('region', { name: 'Where' }))
      .toMatchTextContent('eu.example.InvoiceResource.list');
    await expect
      .element(view.getByRole('region', { name: 'When' }))
      .toMatchTextContent('1 Jan 2026 00:00:00Z');
    const often = view.getByRole('region', { name: 'How often' });
    await expect.element(often).toMatchTextContent('3 occurrences in all');
    await expect.element(often).toMatchTextContent('peak 3');
    expect(opened.page.querySelectorAll('[data-bar]')).toHaveLength(168);
    await expect
      .element(view.getByRole('link', { name: 'Show log lines' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/logs?fingerprint=${FINGERPRINT}&level=ERROR`,
      );
    await expect
      .element(view.getByRole('link', { name: 'Open trace' }))
      .toHaveAttribute(
        'href',
        `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example`,
      );
    const tickets = view.getByRole('region', { name: 'Tickets' });
    await expect
      .element(tickets.getByRole('link', { name: 'contract-00000001-1' }))
      .toHaveAttribute('href', `/projects/${opened.project.slug}/work/detail/contract-00000001-1`);
    await expect.element(tickets).toMatchTextContent('Export answers 500 for an empty quarter');
    await expect.element(tickets).toMatchTextContent('reported');
    await view.getByText('Stack trace').click();
    await expect.element(view.getByText(/at eu\.example\.InvoiceResource\.list/)).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
    await shootShellMenus(opened, 'loaded');
  });

  it('dismiss-error-issue: Dismiss, confirmed, shows the issue DISMISSED', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Dismiss' }).click();
    await opened.settled();
    expect(open(DISMISS)).toHaveLength(0);
    await view.getByRole('button', { name: 'Confirm dismiss?' }).click();
    await opened.idle();
    const [write] = open(DISMISS);
    expect(write.request.method).toBe('POST');
    write.flush(await goldenMaster(STORED, 'dismissErrorIssue', OBS));
    await opened.settled();
    await expect.element(view.getByText('DISMISSED')).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('dismissed', { kind: 'DATA' });
  });

  it('says a refused dismissal needs qits:admin, beside the button', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Dismiss' }).click();
    await opened.settled();
    await view.getByRole('button', { name: 'Confirm dismiss?' }).click();
    await opened.idle();
    open(DISMISS)[0].flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent(
        'Could not dismiss: dismissing an error issue needs qits:admin, qits:admin-agent or qits:desk-admin.',
      );
    await expect.element(view.getByRole('button', { name: 'Dismiss' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('dismiss-refused', { kind: 'ERROR' });
  });

  it('open-error-issue-logs logs: Show log lines opens the Logs page at the fingerprint', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('link', { name: 'Show log lines' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-error-issue-logs:logs',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/logs?fingerprint=${FINGERPRINT}&level=ERROR`,
    );
  });

  it('open-error-issue-trace trace: Open trace opens the sample trace', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('link', { name: 'Open trace' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-error-issue-trace:trace',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/observability/traces/6a1f0c2b9d8e47f3a5b4c3d2e1f00a01?source=_service%2Fqits-example`,
    );
  });

  it('says no ticket has been made from the issue yet', async () => {
    const { opened, view } = await loaded(NO_WORK);
    await expect
      .element(view.getByRole('region', { name: 'Tickets' }))
      .toMatchTextContent('No ticket has been made from this issue yet.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('no-tickets', { kind: 'DATA' });
  });

  it('open-error-issue-ticket open: a ticket opens its page', async () => {
    const { opened, view } = await loaded();
    await view
      .getByRole('region', { name: 'Tickets' })
      .getByRole('link', { name: 'contract-00000001-1' })
      .click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-error-issue-ticket:open',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/work/detail/contract-00000001-1`,
    );
  });

  it('make-ticket-from-error-issue ticket: Make ticket opens the work form filled from the issue', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('link', { name: 'Make ticket' }).click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'make-ticket-from-error-issue:ticket',
    ]);
    const url = new URL(TestBed.inject(Router).url, 'http://x');
    expect(url.pathname).toBe(`/projects/${opened.project.slug}/work/create`);
    expect(url.searchParams.get('archetype')).toBe('TICKET');
    expect(url.searchParams.get('errorIssue')).toBe(FINGERPRINT);
    expect(url.searchParams.get('title')).toBe('IllegalStateException: invoice store unreachable');
    expect(url.searchParams.get('description')).toContain('- Service: qits-example');
  });

  it('reads the issue and its tickets again on Refresh', async () => {
    const { opened, view } = await loaded();
    await view.getByRole('button', { name: 'Refresh' }).click();
    await opened.idle();
    await answerIssue();
    await opened.settled();
    // The issue's read again may answer before the tickets' starts: answer every one open.
    for (const read of http
      .match((request) => isTicketsRead(request))
      .filter((r) => !r.cancelled)) {
      read.flush(await goldenMaster(FROM_ISSUE, 'listProjectWork'));
    }
    await opened.settled();
  });

  it('says no issue has the fingerprint on a 404', async () => {
    const { opened, view } = await render();
    open(ISSUE)[0].flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    await expect
      .element(view)
      .toMatchTextContent(`No error issue has the fingerprint ${FINGERPRINT}.`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('missing', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says a refusal needs qits:admin', async () => {
    const { opened, view } = await render();
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    for (const read of open(ISSUE)) read.flush(null, { status: 403, statusText: 'Forbidden' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('Reading error issues needs qits:admin.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
