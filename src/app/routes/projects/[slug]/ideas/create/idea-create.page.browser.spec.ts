import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';

/**
 * Screenshots of the new idea form (epic qits-888) inside the shell (`openRoute`): the enabling
 * choice from "a project with ideas"' list, and a refusal answered with that state's recorded 400
 * (a title of three sentences).
 *
 * Its outcomes (epic qits-2000), whose buttons `form` shows: Create's `create-idea` `created`, the
 * new idea's page, answered with "a project with no work"' recorded 201, and `refused`, the form
 * kept, shown by `refused`; Cancel's `cancel-idea-create` `back`, the Ideas page. The page an exit
 * leaves for is its own spec's: its reads are answered with an error (`leftFor`).
 */
describe('IdeaCreatePage (screenshots)', () => {
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

  /** The form, its enabling choice read from "a project with ideas". */
  async function form() {
    const opened = await open('ideas/create');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    return { opened, view: page.elementLocator(opened.page) };
  }

  it('create-idea created: Create opens the new idea', async () => {
    const { opened, view } = await form();
    await view.getByRole('textbox', { name: 'Title' }).fill('Faster builds');
    await view
      .getByRole('textbox', { name: 'Description' })
      .fill('Cache the dependencies between runs.');
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.idle();
    const created = await goldenMaster(NO_WORK, 'createIdea');
    http.expectOne('/projects/api/ideas').flush(created, { status: 201, statusText: 'Created' });
    await leftFor(opened);
    expect(reached()).toEqual(['create-idea:created']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/ideas/detail/${created.id}`,
    );
  });

  it('cancel-idea-create back: Cancel goes back to the ideas', async () => {
    const { opened, view } = await form();
    await view.getByRole('button', { name: 'Cancel' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['cancel-idea-create:back']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/ideas`);
  });

  it('shows the form with its counts, and the service’s refusal', async () => {
    const opened = await open('ideas/create');
    listRead().flush(await goldenMaster(IDEAS, 'listIdeas'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('0/3 paragraphs');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('form', { kind: 'DATA' });
    await view
      .getByRole('textbox', { name: 'Title' })
      .fill('Faster builds. Fewer waits. Less cost');
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.settled();
    http
      .expectOne('/projects/api/ideas')
      .flush(await goldenMaster(IDEAS, 'createIdea'), { status: 400, statusText: 'Bad Request' });
    await opened.settled();
    await expect.element(view.getByRole('alert')).toMatchTextContent('at most one');
    expect(reached()).toEqual(['create-idea:refused']);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
  });
});
