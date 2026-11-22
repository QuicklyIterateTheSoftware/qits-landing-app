import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
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

const RECENT = 'a project with recent events';
const FILTERED = 'a project with recent events, filtered by name';
const NONE = 'a project with no events';
const NAMES = 'events of two names';
/** A few minutes after the recorded events, so "how long ago" reads the same on every run. */
const NOW = new Date('2026-01-01T00:04:00Z');

/**
 * Screenshots of a project's Events page (qits-2312) inside the shell (`openRoute`), at the
 * recorded project's slug (qits-projects' "a project exists"), answered with qits-events'
 * recordings: "a project with recent events" (a commit, a ticket's move, a build and a release
 * request's state; `populated`), the same read with the type ReleaseRequestStateChanged chosen
 * ("…, filtered by name"; `filtered`, then that row opened to its detail) and "a project with no
 * events" (`empty`), and a read still open (`loading`) or refused (`error`). The type filter's
 * stored names are "events of two names"'. The recordings' project is not "a project exists"', so
 * the page asks for its own project's id; the answer is the recording all the same.
 *
 * Its exits (epic qits-2000), shown by `populated`, are each followed once: a row's own page
 * (`open-project-event` `event`, qits-2338), a release request a row names
 * (`open-project-event-subject` `releaseRequest`) and a work item (`workItem`). The page
 * each leaves for is its own spec's: its reads are answered with an error (`leftFor`).
 */
describe('ProjectEventsPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  /** The events read: the generated client writes its query into the URL. */
  const eventsRead = (): TestRequest =>
    http.expectOne((req) => req.urlWithParams.startsWith('/events/api/events?'));

  /** The page of the recorded project, with the stored names answered and the list in `state`. */
  async function open(state: string): Promise<OpenedRoute> {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/events`);
    http
      .expectOne('/events/api/events/names')
      .flush(await goldenMaster(NAMES, 'listEventNames', 'qits-events'));
    const read = eventsRead();
    const query = new URLSearchParams(read.request.urlWithParams.split('?')[1]);
    expect(query.get('attr')).toBe(`projectid=${opened.project.id}`);
    expect(query.get('order')).toBe('desc');
    expect(query.get('limit')).toBe('50');
    read.flush(await goldenMaster(state, 'listEvents', 'qits-events'));
    await opened.settled();
    return opened;
  }

  it('lists the project’s events, newest first, with what each concerns', async () => {
    const opened = await open(RECENT);
    const view = page.elementLocator(opened.page);
    const rows = view.getByRole('listitem');
    await expect.element(rows.first()).toMatchTextContent('SCMPublishCommit');
    expect(rows.elements().map((row) => row.querySelector('button')?.textContent?.trim())).toEqual([
      expect.stringContaining('SCMPublishCommit'),
      expect.stringContaining('EntityTransitioned'),
      expect.stringContaining('BuildStatusChanged'),
      expect.stringContaining('ReleaseRequestStateChanged'),
    ]);
    await expect.element(rows.first()).toMatchTextContent('1 Jan 2026 00:00:00Z · 4m ago');
    await expect
      .element(view.getByRole('link', { name: `${opened.project.slug}-42` }))
      .toBeVisible();
    await expect.element(view.getByRole('link', { name: 'qits-ci-service-rr-12' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
    await shootShellMenus(opened, 'populated');
  });

  it('narrows the list to a chosen type, and opens a row to the whole event', async () => {
    const opened = await open(RECENT);
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'All types' }).click();
    await view.getByRole('checkbox', { name: 'ReleaseRequestStateChanged' }).click();
    await opened.settled();
    const read = eventsRead();
    expect(new URLSearchParams(read.request.urlWithParams.split('?')[1]).get('name')).toBe(
      'ReleaseRequestStateChanged',
    );
    read.flush(await goldenMaster(FILTERED, 'listEvents', 'qits-events'));
    await opened.settled();
    // The panel closes on a click outside it.
    await view.getByRole('heading', { name: 'Events', exact: true }).click();
    await expect
      .element(view.getByRole('listitem'))
      .toMatchTextContent('ReleaseRequestStateChanged');
    expect(view.getByRole('listitem').elements()).toHaveLength(1);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered', { kind: 'DATA' });

    await view.getByRole('listitem').getByRole('button').click();
    await opened.settled();
    await expect.element(view.getByRole('heading', { name: 'Event', exact: true })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent('"publisher": "eu.wohlben.qits:qits-projects-service"');
    await expect.element(view).toMatchTextContent('"state": "READY"');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('filtered-detail', { kind: 'DATA' });
  });

  it('says so when no event of the project matches', async () => {
    const opened = await open(NONE);
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent('No events for this project match.');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('empty', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    await page.viewport(1140, 900);
    const opened = await openRoute((project) => `/projects/${project.slug}/events`);
    http
      .expectOne('/events/api/events/names')
      .flush(await goldenMaster(NAMES, 'listEventNames', 'qits-events'));
    const read = eventsRead();
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

  it('open-project-event event: a row’s Open link opens the event’s page', async () => {
    const opened = await open(RECENT);
    const list = await goldenMaster(RECENT, 'listEvents', 'qits-events');
    const first = list.events[0].id;
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: `Open event ${first}` })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-project-event:event']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/events/${first}`);
  });

  it('open-project-event-subject releaseRequest: a request a row names opens its page', async () => {
    const opened = await open(RECENT);
    const list = await goldenMaster(RECENT, 'listEvents', 'qits-events');
    const event = list.events.find(
      (e: { name: string }) => e.name === 'ReleaseRequestStateChanged',
    );
    const requestId = JSON.parse(event.payload).releaseRequestId;
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'qits-ci-service-rr-12' })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-project-event-subject:releaseRequest']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/releases/requests/${requestId}`,
    );
  });

  it('open-project-event-subject workItem: a work item a row names opens its page', async () => {
    const opened = await open(RECENT);
    const id = `${opened.project.slug}-42`;
    await page.elementLocator(opened.page).getByRole('link', { name: id }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-project-event-subject:workItem']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/work/detail/${id}`);
  });
});
