import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { openRoute, provideAppRoute } from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the Release Requests page inside the shell (`openRoute`), answered with
 * qits-projects' recordings: "a project with pending release requests" (one request in each of
 * PENDING, RELEASED, READY, REJECTED, CONFLICTED and FINALIZED) and "a project with no release
 * requests". The page's read is the shell's too (its lightning menu and its sidebar line), so
 * `openRoute` answers it in the state a spec names. The open project is the recorded one ("a
 * project exists"), found by the URL's slug in the recorded project list.
 */
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
