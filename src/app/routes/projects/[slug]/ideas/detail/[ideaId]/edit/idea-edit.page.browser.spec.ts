import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';
const RANKED = 'a project with three ideas, one with a priority';
const ENABLED = 'an idea enabled by another idea';

/**
 * Screenshots of an idea's edit (epic qits-888) inside the shell (`openRoute`): the form filled
 * with "a project with ideas"' `getIdea` (two paragraphs), the enabling choice from that state's
 * list.
 *
 * Its outcomes (epic qits-2000), whose buttons `form` shows, each reached once: Save's `edit-idea`
 * `unchanged` (nothing typed: the idea's page, no write), `saved` (the idea's page after the
 * write: the form filled with "a project with three ideas, one with a priority"' `getIdea`, whose
 * idea is the one "a project with ideas"' `patchIdea` renames, answered with that recording) and
 * `refused` (the form kept: "an idea enabled by another idea"' `getIdea` and its recorded 400,
 * shown by `refused`); Cancel's `cancel-idea-edit` `back`, the idea's page. The page an exit leaves
 * for is its own spec's: its reads are answered with an error (`leftFor`).
 */
describe('IdeaEditPage (screenshots)', () => {
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

  /** The form, filled with `state`'s recorded idea; the enabling choice from "a project with ideas". */
  async function form(state: string) {
    const idea = await goldenMaster(state, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}/edit`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('textbox', { name: 'Title' })).toHaveValue(idea.title);
    return { opened, idea, view };
  }

  /** The idea's page the edit leaves for. */
  const ideaUrl = (opened: OpenedRoute, ideaId: string) =>
    `/projects/${opened.project.slug}/ideas/detail/${ideaId}`;

  it('cancel-idea-edit back: Cancel goes back to the idea without a write', async () => {
    const { opened, idea, view } = await form(IDEAS);
    await view.getByRole('button', { name: 'Cancel' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['cancel-idea-edit:back']);
    expect(TestBed.inject(Router).url).toBe(ideaUrl(opened, idea.id));
  });

  it('edit-idea unchanged: Save with nothing changed goes back without a write', async () => {
    const { opened, idea, view } = await form(IDEAS);
    await view.getByRole('button', { name: 'Save' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['edit-idea:unchanged']);
    expect(TestBed.inject(Router).url).toBe(ideaUrl(opened, idea.id));
  });

  it('edit-idea saved: Save sends the change, then goes back to the idea', async () => {
    const { opened, idea, view } = await form(RANKED);
    const patched = await goldenMaster(IDEAS, 'patchIdea');
    expect(patched.id).toBe(idea.id);
    await view.getByRole('textbox', { name: 'Title' }).fill(patched.title);
    await view.getByRole('button', { name: 'Save' }).click();
    await opened.idle();
    const patch = http.expectOne(`/projects/api/ideas/${idea.id}`);
    expect(patch.request.method).toBe('PATCH');
    patch.flush(patched);
    await leftFor(opened);
    expect(reached()).toEqual(['edit-idea:saved']);
    expect(TestBed.inject(Router).url).toBe(ideaUrl(opened, idea.id));
  });

  it('edit-idea refused: a refused Save keeps the form, with the service’s words', async () => {
    const { opened, idea, view } = await form(ENABLED);
    await view
      .getByRole('textbox', { name: 'Title' })
      .fill('Faster builds. Fewer waits. Less cost');
    await view.getByRole('button', { name: 'Save' }).click();
    await opened.idle();
    http
      .expectOne(`/projects/api/ideas/${idea.id}`)
      .flush(await goldenMaster(ENABLED, 'patchIdea'), { status: 400, statusText: 'Bad Request' });
    await opened.settled();
    await expect.element(view.getByRole('alert')).toMatchTextContent('at most one');
    expect(reached()).toEqual(['edit-idea:refused']);
    expect(TestBed.inject(Router).url).toBe(`${ideaUrl(opened, idea.id)}/edit`);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });

  it('fills the form with the idea and counts its description', async () => {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const opened = await open(`ideas/detail/${idea.id}/edit`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('2/3 paragraphs');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('form', { kind: 'DATA' });
  });
});
