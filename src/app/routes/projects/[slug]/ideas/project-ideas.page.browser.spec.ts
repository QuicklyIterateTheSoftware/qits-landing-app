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
import { shootShellMenus } from '../../../../../testing/browser/shell-menus';

const IDEAS = 'a project with ideas';

/**
 * Screenshots of the Ideas page (epic qits-888) inside the shell (`openRoute`), answered with
 * qits-projects' recordings: "a project with ideas"' list (a queued and a planned idea). The open
 * project is "a project exists"'. Both ideas are rankable (qits-1791), so each row has a drag
 * handle on its bottom-right corner; an archived or DONE idea's missing handle is the unit spec's,
 * as no recorded list holds one.
 *
 * Its exits (epic qits-2000), shown by `list`, are each followed once: an idea's title
 * (`open-listed-idea` `open`) and New idea (`open-idea-create` `open`). The page each leaves for
 * is its own spec's: its reads are answered with an error (`leftFor`).
 */
describe('ProjectIdeasPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** The page at `path` below the recorded project ("a project exists"). */
  async function open(path: string) {
    await page.viewport(1140, 900);
    return openRoute((project) => `/projects/${project.slug}/${path}`);
  }

  /** The list read: the generated client writes its query into the URL. */
  const listRead = () =>
    http.expectOne((req) => req.urlWithParams.startsWith('/projects/api/ideas?'));

  it('lists the ideas with their status', async () => {
    const opened = await open('ideas');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Share the build cache');
    // Both recorded ideas are rankable (QUEUED, PLANNED, neither archived): each has a handle.
    await expect.element(view.getByRole('button', { name: 'Move Faster builds' })).toBeVisible();
    await expect
      .element(view.getByRole('button', { name: 'Move Share the build cache' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('list', { kind: 'DATA' });
    await shootShellMenus(opened, 'list');
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

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /** The page with the recorded list. */
  async function listed() {
    const opened = await open('ideas');
    const list = await goldenMaster(IDEAS, 'listIdeas');
    listRead().flush(list);
    await opened.settled();
    return { opened, list, view: page.elementLocator(opened.page) };
  }

  it('open-listed-idea open: an idea’s title opens its page', async () => {
    const { opened, list, view } = await listed();
    const idea = list.ideas.find((i: { title: string }) => i.title === 'Share the build cache');
    await view.getByRole('link', { name: 'Share the build cache' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-listed-idea:open']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ideas/detail/${idea.id}`,
    );
  });

  it('open-idea-create open: New idea opens the form', async () => {
    const { opened, view } = await listed();
    await view.getByRole('button', { name: 'New idea' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-idea-create:open']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ideas/create`);
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open('ideas');
    const read = listRead();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
