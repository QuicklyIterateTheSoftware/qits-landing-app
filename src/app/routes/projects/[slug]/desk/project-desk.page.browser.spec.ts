import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../testing/browser/app-route';

/**
 * Screenshots of the Desk page inside the shell (`openRoute`). The open project is the recorded
 * one ("a project exists"), found by the URL's slug in the recorded project list, the same as the
 * other project pages' specs.
 *
 * `listDeskTriggerMessages` is answered from qits-projects' golden masters: "a project whose desk
 * received a trigger message" (a work item's line and a release request's) and "a project whose
 * desk was addressed in a comment" (a line naming its comment, qits-2039).
 *
 * A line's item is a declared exit (`open-desk-line`, epic qits-2000), each followed once: a
 * release request's (`releaseRequest`), a work item's (`workItem`) and a work item's at the
 * comment the line names (`workItem` with its `#comment-<id>` fragment). The page each leaves for
 * is its own spec's: its reads are answered with an error (`leftFor`).
 */

describe('ProjectDeskPage (screenshots)', () => {
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

  async function render() {
    // Tall enough for every row: a screenshot shows only what is in the viewport.
    await page.viewport(1140, 1000);
    const opened = await openRoute((project) => `/projects/${project.slug}/desk`);
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/work`)
      .flush(await goldenMaster('a project with no work', 'listProjectWork'));
    return {
      opened,
      request: http.expectOne(`/projects/api/projects/${opened.project.id}/desk-triggers`),
    };
  }

  const RECEIVED = 'a project whose desk received a trigger message';
  const COMMENTED = 'a project whose desk was addressed in a comment';

  /** The page with `state`'s trigger messages. */
  async function loaded(state: string) {
    const { opened, request } = await render();
    request.flush(await goldenMaster(state, 'listDeskTriggerMessages'));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

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

  it('lists a message with its badge, times, and each line’s source, item and cause', async () => {
    const { opened, view } = await loaded(RECEIVED);
    await expect.element(view).toMatchTextContent('delivered');
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-1580', exact: true }))
      .toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'contract-service-rr-7', exact: true }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loaded', { kind: 'DATA' });
  });

  it.each([
    ['releaseRequest', 'contract-service-rr-7', 'release-requests/contract-service-rr-7'],
    ['workItem', 'contract-00000001-1580', 'work/detail/contract-00000001-1580'],
  ])('open-desk-line %s: the line’s item “%s” opens its page', async (outcome, name, path) => {
    const { opened, view } = await loaded(RECEIVED);
    await view.getByRole('link', { name, exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual([`open-desk-line:${outcome}`]);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/${path}`);
  });

  it('links a line that names a comment to that comment', async () => {
    const { opened, view } = await loaded(COMMENTED);
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-1', exact: true }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('commented', { kind: 'DATA' });
  });

  it('open-desk-line workItem: a line that names a comment opens the item at that comment', async () => {
    const messages = await goldenMaster(COMMENTED, 'listDeskTriggerMessages');
    const commentId = messages.messages[0].events[0].commentId;
    const { opened, view } = await loaded(COMMENTED);
    await view.getByRole('link', { name: 'contract-00000001-1', exact: true }).click();
    await leftFor(opened);
    expect(fired()).toEqual(['open-desk-line:workItem']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/work/detail/contract-00000001-1#comment-${commentId}`,
    );
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const { opened, request } = await render();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    request.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect
      .element(view.getByRole('alert'))
      .toMatchTextContent('This project’s desk trigger messages could not be read.');
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
