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
import { shootShellMenus } from '../../../../../../testing/browser/shell-menus';
import { ticketDraft } from '$core/observability/error-issues';

const IDEAS = 'a project with ideas';
const NO_WORK = 'a project with no work';
/** A ticket made from the error issue `0123456789abcdef0123456789abcdef` (qits-2538). */
const FROM_ISSUE = 'a ticket made from an error issue';

/**
 * Screenshots of the work create form (epic qits-888) inside the shell (`openRoute`; the form sits
 * outside the work tabs), opened from "a project with ideas"' idea (its `getIdea`) as Create epic
 * and Create ticket open it, and a ticket refused with that state's recorded 400 (no impetus).
 *
 * One test reaches each declared outcome (epic qits-2000): `create-work-item` `created` (answered
 * with "a project with no work"'s created ticket and that state's work list) and `refused`,
 * `cancel-work-create` `toIdea` and `toWork`, `open-inspiring-idea` `open`, and
 * `open-work-form-error-issue` `open` (qits-2538). The form made from an error issue, as the issue's
 * Make ticket opens it, is shot filled from qits-observability's recorded issue, and its Create
 * sends what "a ticket made from an error issue" recorded (`errorIssue` included). An exit needs no
 * screenshot of its own: the `from-idea-*` ones show the idea link, Create and Cancel (`toIdea`),
 * and `refused` shows Create and Cancel (`toWork`). The page an exit leaves for is not this spec's:
 * its reads are answered with an error (`leftFor`), which may carry anything.
 */
describe('WorkCreatePage (screenshots)', () => {
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
    // As wide as the form was, plus the sidebar.
    await page.viewport(1140, 900);
    return openRoute((project) => `/projects/${project.slug}/${path}`);
  }

  /** The form opened from the recorded idea as a new `archetype`, its `getIdea` answered. */
  async function fromIdea(archetype: string) {
    const idea = await goldenMaster(IDEAS, 'getIdea');
    const query = new URLSearchParams({
      archetype,
      title: idea.title,
      description: idea.description,
      inspiredBy: idea.id,
    });
    const opened = await open(`work/create?${query}`);
    http.expectOne(`/projects/api/ideas/${idea.id}`).flush(idea);
    await opened.settled();
    return { opened, idea };
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * — its frame reads included — with a 404 (an error answer is only a status): that page is its
   * own spec's, so none of its reads may show as answered from a golden master in the route ledger.
   * `idle()`, not `settled()`, so the destination's frame reads (its `WorkLayout`, say) get the same
   * 404 instead of a recorded answer (qits-2056). Answers in rounds, as a read may follow another's
   * answer, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  /**
   * The form as an error issue's Make ticket opens it (qits-2538): a ticket naming the recorded
   * issue's fingerprint, its title and description `ticketDraft`'s of the issue.
   */
  async function fromErrorIssue() {
    const issue = await goldenMaster('stored error issues', 'getErrorIssue', 'qits-observability');
    const { title, description } = ticketDraft(issue);
    const query = new URLSearchParams({
      archetype: 'TICKET',
      errorIssue: issue.fingerprint,
      title,
      description,
    });
    const opened = await open(`work/create?${query}`);
    await opened.settled();
    return { opened, issue };
  }

  /** The outcomes the test reached, as their trigger marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  const url = () => TestBed.inject(Router).url;

  it.each(['EPIC', 'TICKET'])('is filled from an idea as a new %s', async (archetype) => {
    const { opened } = await fromIdea(archetype);
    await expect.element(page.elementLocator(opened.page)).toMatchTextContent('Inspired by');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot(`from-idea-${archetype.toLowerCase()}`, { kind: 'DATA' });
    await shootShellMenus(opened, `from-idea-${archetype.toLowerCase()}`);
  });

  it('create-work-item created: goes to the new ticket’s page', async () => {
    const opened = await open('work/create?archetype=TICKET');
    const created = await goldenMaster(NO_WORK, 'createWork');
    const view = page.elementLocator(opened.page);
    await view.getByRole('textbox', { name: 'Title' }).fill(created.title);
    await view.getByRole('textbox', { name: 'Impetus' }).fill(created.impetus);
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.settled();
    http.expectOne('/projects/api/work').flush(created, { status: 201, statusText: 'Created' });
    await opened.settled();
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/work`)
      .flush(await goldenMaster(NO_WORK, 'listProjectWork'));
    await leftFor(opened);
    expect(url()).toBe(`/projects/${opened.project.slug}/work/detail/${created.qualifiedId}`);
    expect(reached()).toEqual(['create-work-item:created']);
  });

  it('create-work-item refused: stays, with the service’s words', async () => {
    const opened = await open('work/create?archetype=TICKET');
    const view = page.elementLocator(opened.page);
    await view.getByRole('textbox', { name: 'Title' }).fill('Faster builds');
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.settled();
    http
      .expectOne('/projects/api/work')
      .flush(await goldenMaster(IDEAS, 'createWork'), { status: 400, statusText: 'Bad Request' });
    await opened.settled();
    await expect.element(view.getByRole('alert')).toMatchTextContent('impetus is required');
    await expect
      .element(view.getByRole('button', { name: 'Cancel' }))
      .toHaveAttribute('data-qits-outcome', 'cancel-work-create:toWork');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('refused', { kind: 'ERROR' });
    expect(url()).toBe(`/projects/${opened.project.slug}/work/create?archetype=TICKET`);
    expect(reached()).toEqual(['create-work-item:refused']);
  });

  it('cancel-work-create toIdea: goes back to the idea it was opened from', async () => {
    const { opened, idea } = await fromIdea('EPIC');
    await page.elementLocator(opened.page).getByRole('button', { name: 'Cancel' }).click();
    await leftFor(opened);
    expect(url()).toBe(`/projects/${opened.project.slug}/ideas/detail/${idea.id}`);
    expect(reached()).toEqual(['cancel-work-create:toIdea']);
  });

  it('cancel-work-create toWork: goes to the project’s work', async () => {
    const opened = await open('work/create?archetype=EPIC');
    await page.elementLocator(opened.page).getByRole('button', { name: 'Cancel' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['cancel-work-create:toWork']);
    expect(outcomeRecords()[0].url).toBe(`/projects/${opened.project.slug}/work`);
    // `/work` opens its In Progress tab (`redirectTo` in `app.routes.ts`).
    expect(url()).toBe(`/projects/${opened.project.slug}/work/in-progress`);
  });

  it('open-inspiring-idea open: the “Inspired by” link opens the idea', async () => {
    const { opened, idea } = await fromIdea('TICKET');
    await page.elementLocator(opened.page).getByRole('link', { name: idea.title }).click();
    await leftFor(opened);
    expect(url()).toBe(`/projects/${opened.project.slug}/ideas/detail/${idea.id}`);
    expect(reached()).toEqual(['open-inspiring-idea:open']);
  });

  it('is filled from an error issue as a new bug ticket naming it', async () => {
    const { opened, issue } = await fromErrorIssue();
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByText('Made from error issue', { exact: false }))
      .toMatchTextContent(`Made from error issue ${issue.fingerprint}`);
    await expect.element(view.getByRole('combobox', { name: 'Kind' })).toHaveValue('BUG');
    await expect
      .element(view.getByRole('textbox', { name: 'Title' }))
      .toHaveValue('IllegalStateException: invoice store unreachable');
    await expect
      .element(view.getByRole('textbox', { name: 'Description' }))
      .toHaveValue(expect.stringContaining('- Service: qits-example'));
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('from-error-issue', { kind: 'DATA' });
  });

  it('create-work-item created: a ticket made from an error issue sends its errorIssue', async () => {
    const created = await goldenMaster(FROM_ISSUE, 'createWork');
    const { opened, issue } = await fromErrorIssue();
    const view = page.elementLocator(opened.page);
    await view.getByRole('textbox', { name: 'Title' }).fill(created.title);
    await view.getByRole('textbox', { name: 'Impetus' }).fill(created.impetus);
    await view.getByRole('button', { name: 'Create' }).click();
    await opened.settled();
    const create = http.expectOne('/projects/api/work');
    expect(create.request.body).toMatchObject({
      archetype: 'TICKET',
      ticketType: 'BUG',
      errorIssue: issue.fingerprint,
      title: created.title,
      impetus: created.impetus,
    });
    create.flush(created, { status: 201, statusText: 'Created' });
    await opened.settled();
    http
      .expectOne(`/projects/api/projects/${opened.project.id}/work`)
      .flush(await goldenMaster(FROM_ISSUE, 'listProjectWork'));
    await leftFor(opened);
    expect(url()).toBe(`/projects/${opened.project.slug}/work/detail/${created.qualifiedId}`);
    expect(reached()).toEqual(['create-work-item:created']);
  });

  it('open-work-form-error-issue open: the “Made from error issue” link opens the issue', async () => {
    const { opened, issue } = await fromErrorIssue();
    await page.elementLocator(opened.page).getByRole('link', { name: issue.fingerprint }).click();
    await leftFor(opened);
    expect(url()).toBe(
      `/projects/${opened.project.slug}/observability/errors/${issue.fingerprint}`,
    );
    expect(reached()).toEqual(['open-work-form-error-issue:open']);
  });
});
