import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

/**
 * Screenshots of the Release Requests page inside the shell (`openRoute`), answered with
 * qits-projects' recordings: "a project with pending release requests" (one request in each of
 * PENDING, RELEASED, READY, REJECTED, CONFLICTED and FINALIZED) and "a project with no release
 * requests". The page's read is the shell's too (its lightning menu and its sidebar line), so
 * `openRoute` answers it in the state a spec names. The open project is the recorded one ("a
 * project exists"), found by the URL's slug in the recorded project list.
 *
 * A row's links are declared exits (`open-listed-release-request`, epic qits-2000), each followed
 * once: the request's name (`request`, as an item's text is), `queued behind` on "a frozen release
 * request with a queued next request" (`queuedBehind`), the check that needs a person on "a project
 * with release requests in every state" (`attention`, at the check's anchor), and an item's work
 * item on "a repository with a tagged release whose request went obsolete mid-publish"
 * (`workItem`, qits-2039). The page each leaves for is its own spec's: its reads are answered with
 * an error (`leftFor`).
 */
/** A request superseded mid-publish and its successor, whose item names a work item (qits-2039). */
const OBSOLETE = 'a repository with a tagged release whose request went obsolete mid-publish';

describe('ReleaseRequestsPage (screenshots)', () => {
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

  /** The page of the recorded project, its release requests answered as `releaseRequests` names. */
  async function render(releaseRequests: string) {
    // As wide as the page was, plus the sidebar; tall enough for every row, as the shell shows
    // only what is in the viewport.
    await page.viewport(1140, 1000);
    return openRoute((project) => `/projects/${project.slug}/release-requests`, {
      releaseRequests,
    });
  }

  it('lists every request with its state, gates and facts', async () => {
    const opened = await render('a project with pending release requests');
    const view = page.elementLocator(opened.page);
    expect(view.getByRole('listitem').elements()).toHaveLength(6);
    // The finalized request, last: the rows no longer show a summary (qits-1673).
    await expect.element(view).toMatchTextContent('contract-service-rr-1');
    await expect.element(view).toMatchTextContent('The sources cannot be folded.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('requests', { kind: 'DATA' });
    await shootShellMenus(opened, 'requests');
  });

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's (`idle()`, not
   * `settled()`, qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  /** The outcomes recorded so far, as `interaction:outcome`. */
  const fired = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  it('open-listed-release-request request: a request’s name opens its page', async () => {
    const opened = await render('a project with pending release requests');
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'contract-service-rr-3', exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-listed-release-request:request']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/release-requests/contract-service-rr-3`,
    );
  });

  it('links the request a queued one waits behind', async () => {
    const opened = await render('a frozen release request with a queued next request');
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('link', { name: 'queued behind contract-service-rr-1' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('frozen', { kind: 'DATA' });
  });

  it('open-listed-release-request queuedBehind: “queued behind” opens the request ahead', async () => {
    const opened = await render('a frozen release request with a queued next request');
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'queued behind contract-service-rr-1' }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-listed-release-request:queuedBehind']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/release-requests/contract-service-rr-1`,
    );
  });

  it('rings a request that needs a person, with a link to that check', async () => {
    const opened = await render('a project with release requests in every state');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('link', { name: /^Approve · / })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('attention', { kind: 'DATA' });
  });

  it('open-listed-release-request attention: the check that needs a person opens at its anchor', async () => {
    const opened = await render('a project with release requests in every state');
    const view = page.elementLocator(opened.page);
    const link = view.getByRole('link', { name: /^Approve · / });
    const href = (link.element() as HTMLAnchorElement).getAttribute('href') ?? '';
    await link.click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-listed-release-request:attention']);
    const url = TestBed.inject(Router).url;
    expect(url).toMatch(
      new RegExp(`^/projects/${opened.project.slug}/release-requests/contract-suite-app-rr-1#.+`),
    );
    expect(url).toBe(href);
  });

  it('links the work item a request’s item names', async () => {
    const opened = await render(OBSOLETE);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-1', exact: true }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('work-item', { kind: 'DATA' });
  });

  it('open-listed-release-request workItem: an item’s work item opens its page', async () => {
    const opened = await render(OBSOLETE);
    const view = page.elementLocator(opened.page);
    await view.getByRole('link', { name: 'contract-00000001-1', exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-listed-release-request:workItem']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/work/detail/contract-00000001-1`,
    );
  });

  it('says so when the project has none', async () => {
    const opened = await render('a project with no release requests');
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Nothing is open in this project');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await render('unanswered');
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    for (const read of http.match(`/projects/api/projects/${opened.project.id}/release-requests`)) {
      read.flush(null, { status: 500, statusText: 'Server Error' });
    }
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This project’s release requests could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });

  // At 390px an item's text, read as one unbroken word (a long test name, which qits-projects can
  // send as a branch's label or a work item's title), overflowed the page (qits-1864): the text <a>
  // is a flex item whose min-width is auto (min-content), and `break-words` does not lower it.
  // `wrap-anywhere` on the <a> does. No recorded answer carries a word that long, so the one
  // recorded item's text is swapped for it directly, after the real page renders with the real
  // golden master and the real CSS classes. At this width the shell folds its sidebar away.
  it('keeps a long unbroken item word on screen at 390px (qits-1864)', async () => {
    await page.viewport(390, 844);
    const opened = await openRoute((project) => `/projects/${project.slug}/release-requests`, {
      releaseRequests: 'a project with release requests in every state',
    });
    const item = opened.page.querySelector('[data-item]')!;
    const link = item.querySelector('a:not([data-work-item])') as HTMLAnchorElement;
    link.textContent =
      'qits-projects-service: AgentTunnelProxyTest.aNonceIsSingleUseAndExpiresAfterTheFirstDial';
    const li = link.closest('li')!;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(
      li.getBoundingClientRect().right,
    );
  });
});
