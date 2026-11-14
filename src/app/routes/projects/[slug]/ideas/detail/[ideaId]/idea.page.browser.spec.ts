import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import { shootShellMenus } from '../../../../../../../testing/browser/shell-menus';

const IDEAS = 'a project with ideas';
const ENABLED = 'an idea enabled by another idea';

/**
 * Screenshots of an idea's page (epic qits-888) inside the shell (`openRoute`), answered with "a
 * project with ideas"' `getIdea`: a queued idea that enables another and inspired an epic. The
 * open project is "a project exists"'. `enabled-by` shows "an idea enabled by another idea"'
 * `getIdea` (qits-2039): an idea whose enabling idea is archived, linked, with the hint.
 *
 * Its exits (epic qits-2000), each followed once: the enabling idea (`open-enabling-idea` `open`,
 * shown by `enabled-by`), an idea it enables (`open-enabled-idea` `open`), a work item it inspired
 * (`open-inspired-work` `open`), Edit (`open-idea-edit` `open`), and Create epic / Create ticket
 * (`create-work-from-idea` `epic` / `ticket`, with the form's query), the last four shown by
 * `idea`. The page each leaves for is its own spec's: its reads are answered with an error
 * (`leftFor`).
 */
describe('IdeaPage (screenshots)', () => {
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

  it('shows the idea, what it enables and the work it inspired', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('Cache the build dependencies');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('idea', { kind: 'DATA' });
    await shootShellMenus(opened, 'idea');
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

  /** The page of `state`'s recorded idea. */
  async function shown(state: string) {
    const idea = await goldenMaster(state, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(idea.title);
    return { opened, idea, view };
  }

  it('links the idea enabling it, and says it is archived', async () => {
    const { opened, view, idea } = await shown(ENABLED);
    const section = view.getByRole('region', { name: 'Enabled by' });
    await expect.element(section).toMatchTextContent(idea.enabledByIdea.title);
    await expect.element(section).toMatchTextContent('That idea is archived.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('enabled-by', { kind: 'DATA' });
  });

  it('open-enabling-idea open: the “Enabled by” link opens the enabling idea', async () => {
    const { opened, view, idea } = await shown(ENABLED);
    await view
      .getByRole('region', { name: 'Enabled by' })
      .getByRole('link', { name: idea.enabledByIdea.title })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-enabling-idea:open']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ideas/detail/${idea.enabledByIdea.id}`,
    );
  });

  it('open-enabled-idea open: an idea it enables opens that idea', async () => {
    const { opened, view, idea } = await shown(IDEAS);
    const enabled = idea.enables[0];
    await view
      .getByRole('region', { name: 'Enables' })
      .getByRole('link', { name: enabled.title })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-enabled-idea:open']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ideas/detail/${enabled.id}`,
    );
  });

  it('open-inspired-work open: a work item it inspired opens the item', async () => {
    const { opened, view, idea } = await shown(IDEAS);
    const work = idea.inspired[0];
    await view
      .getByRole('region', { name: 'Inspired work' })
      .getByRole('link', { name: work.qualifiedId })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-inspired-work:open']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/work/detail/${work.qualifiedId}`,
    );
  });

  it('open-idea-edit open: Edit opens the edit form', async () => {
    const { opened, view, idea } = await shown(IDEAS);
    await view.getByRole('button', { name: 'Edit', exact: true }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-idea-edit:open']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ideas/detail/${idea.id}/edit`,
    );
  });

  it.each([
    ['epic', 'Create epic', 'EPIC'],
    ['ticket', 'Create ticket', 'TICKET'],
  ])(
    'create-work-from-idea %s: %s opens the work form filled with the idea',
    async (outcome, label, archetype) => {
      const { opened, view, idea } = await shown(IDEAS);
      await view.getByRole('button', { name: label }).click();
      await leftFor(opened);
      expect(reached()).toEqual([`create-work-from-idea:${outcome}`]);
      const url = new URL(TestBed.inject(Router).url, 'http://localhost');
      expect(url.pathname).toBe(`/projects/${opened.project.slug}/work/create`);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        archetype,
        title: idea.title,
        description: idea.description,
        inspiredBy: idea.id,
      });
    },
  );

  it('asks for a reason before it archives', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Archive', exact: true }).click();
    await opened.settled();
    await expect.element(view.getByRole('textbox', { name: 'Reason' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('archiving', { kind: 'DATA' });
  });
});
