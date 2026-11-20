import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
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

const WITH_CAUSE = 'an event of a project with a cause and effects';
const CAUSE = 'the cause of a project event';
const LEAF = 'an event of a project with no effects';
const NO_EVENT = 'no event with the given id';

/** The ids the states record: the event (…0003), its cause (…0002) and its two effects. */
const EVENT_ID = '00000000-0000-4000-8000-000000000003';
const CAUSE_ID = '00000000-0000-4000-8000-000000000002';
const EFFECT_IDS = ['00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000007'];
const MISSING_ID = '00000000-0000-4000-8000-000000000001';

/** What each read of the chain is answered with: the recording of (state, operation). */
const RECORDED: Readonly<Record<string, readonly [string, string]>> = {
  [`get ${EVENT_ID}`]: [WITH_CAUSE, 'getEvent'],
  [`get ${CAUSE_ID}`]: [CAUSE, 'getEvent'],
  [`children ${CAUSE_ID}`]: [CAUSE, 'listEvents'],
  [`children ${EVENT_ID}`]: [WITH_CAUSE, 'listEvents'],
  [`children ${EFFECT_IDS[0]}`]: [LEAF, 'listEvents'],
  [`children ${EFFECT_IDS[1]}`]: [LEAF, 'listEvents'],
};

/**
 * Screenshots of an event's page (qits-2338) inside the shell (`openRoute`), at the recorded
 * project's slug (qits-projects' "a project exists", whose id every recorded payload names),
 * answered with qits-events' recordings: "an event of a project with a cause and effects" (the
 * event, a BuildStatusChanged, and its two effects), "the cause of a project event" (its cause, a
 * ReleaseRequestStateChanged, and what it caused: the event) and "an event of a project with no
 * effects" (what each effect caused: nothing), so the chain is four events in three levels
 * (`populated`); the cause's own page (`cause`), where its release request is a link; "no event
 * with the given id" (a 404, `not-found`); a read still open (`loading`) or refused (`error`); and
 * the chain's walk refused while the event stays on screen (`chain-error`).
 *
 * Its exits (epic qits-2000) are each followed once: "← Events" (`leave-project-event` `back`),
 * the cause (`open-related-project-event` `cause`), an effect in the chain (`chain`) and the
 * cause's release request (`open-project-event-subject` `releaseRequest`). The page each leaves
 * for is its own spec's: its reads are answered with an error (`leftFor`).
 */
describe('ProjectEventPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideAppRoute()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /** A read of qits-events' events: `get <id>` or `children <parentId>`. */
  const keyOf = (request: TestRequest): string | undefined => {
    const url = request.request.urlWithParams;
    const get = /^\/events\/api\/events\/([0-9a-f-]+)$/.exec(url);
    if (get) return `get ${get[1]}`;
    const children = /^\/events\/api\/events\?parentId=([0-9a-f-]+)$/.exec(url);
    return children ? `children ${children[1]}` : undefined;
  };

  /** The events reads open now. */
  const eventReads = (): TestRequest[] =>
    http.match((req) => req.url.startsWith('/events/api/events')).filter((r) => !r.cancelled);

  /**
   * Answers every events read the page makes from its recording ({@link RECORDED}), round by
   * round, until none is open; `refuse` reads are answered 500 instead.
   */
  async function answerReads(opened: OpenedRoute, refuse: readonly string[] = []) {
    for (let round = 0; round < 10; round++) {
      const open = eventReads();
      if (!open.length) break;
      for (const request of open) {
        const key = keyOf(request) ?? request.request.urlWithParams;
        if (refuse.includes(key)) {
          request.flush(null, { status: 500, statusText: 'Server Error' });
          continue;
        }
        const recorded = RECORDED[key];
        if (!recorded) throw new Error(`No recording answers ${key}`);
        request.flush(await goldenMaster(recorded[0], recorded[1], 'qits-events'));
      }
      await opened.settled();
    }
  }

  /** The page of event `id`, its reads still open; tall enough for the whole chain. */
  async function open(id: string): Promise<OpenedRoute> {
    await page.viewport(1140, 1300);
    return openRoute((project) => `/projects/${project.slug}/events/${id}`);
  }

  /** The page of event `id`, answered with its recordings, its chain walked. */
  async function render(id: string): Promise<OpenedRoute> {
    const opened = await open(id);
    await answerReads(opened);
    return opened;
  }

  it('shows the event, its facts, its payload and its whole chain', async () => {
    const opened = await render(EVENT_ID);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('BuildStatusChanged');
    await expect
      .element(view.getByText('qits-ci-service · qits-ci-service main: VERIFY succeeded'))
      .toBeVisible();
    const facts = view.getByRole('definition');
    expect(facts.elements().map((dd) => dd.textContent?.trim())).toEqual([
      expect.stringContaining('1 Jan 2026 00:00:00Z'),
      '1 Jan 2026 00:00:00Z',
      '1 Jan 2026 00:00:00Z',
      EVENT_ID,
      'eu.wohlben.qits:qits-ci-service',
      'dev',
      'qits-ci-service main: VERIFY succeeded',
      CAUSE_ID,
    ]);
    await expect.element(view.getByRole('link', { name: CAUSE_ID })).toBeVisible();
    await expect.element(view).toMatchTextContent('"phase": "VERIFY"');
    const chain = view.getByRole('table', { name: 'Chain' });
    const rows = chain.getByRole('row');
    // The header row, then the cause, the event, and its two effects (…0007 before …0004: same
    // instant, the id breaks the tie).
    const cells = (row: Element) =>
      [...row.querySelectorAll('th, td')].map((cell) =>
        cell.textContent?.replace(/\s+/g, ' ').trim(),
      );
    expect(rows.elements().map(cells)).toEqual([
      ['Time (UTC)', 'Event', 'Repository', 'Summary'],
      [
        '1 Jan 2026 00:00:00Z',
        'ReleaseRequestStateChanged',
        'qits-ci-service',
        'Release request qits-ci-service-rr-12 is ready',
      ],
      [
        '1 Jan 2026 00:00:00Z',
        expect.stringMatching(/^BuildStatusChanged\s*this event$/),
        'qits-ci-service',
        'qits-ci-service main: VERIFY succeeded',
      ],
      [
        '1 Jan 2026 00:00:00Z',
        'BuildStatusChanged',
        'qits-ci-service',
        'qits-ci-service main: PUBLISH started',
      ],
      ['1 Jan 2026 00:00:00Z', 'BuildSuccessful', 'qits-ci-service', 'main · 0123456'],
    ]);
    await expect.element(chain).toMatchTextContent('4 events · 6 requests');
    // Every other event of the chain links its page; the event itself does not.
    expect(chain.getByRole('link').elements()).toHaveLength(3);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('populated', { kind: 'DATA' });
    await shootShellMenus(opened, 'populated');
  });

  it('shows the chain from its start, with the release request it names', async () => {
    const opened = await render(CAUSE_ID);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('ReleaseRequestStateChanged');
    await expect.element(view.getByRole('link', { name: 'qits-ci-service-rr-12' })).toBeVisible();
    await expect.element(view.getByText('Nothing in the log caused this event.')).toBeVisible();
    await expect
      .element(view.getByRole('table', { name: 'Chain' }))
      .toMatchTextContent('4 events · 5 requests');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('cause', { kind: 'DATA' });
  });

  it('says there is no such event in the project', async () => {
    const opened = await open(MISSING_ID);
    http
      .expectOne(`/events/api/events/${MISSING_ID}`)
      .flush(await goldenMaster(NO_EVENT, 'getEvent', 'qits-events'), {
        status: 404,
        statusText: 'Not Found',
      });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view).toMatchTextContent(`No event ${MISSING_ID} in this project.`);
    await expect.element(view.getByText(/could not be read/)).not.toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('not-found', { kind: 'NO_DATA' });
  });

  it('marks the page as loading, then says it failed, with Retry', async () => {
    const opened = await open(EVENT_ID);
    const read = http.expectOne(`/events/api/events/${EVENT_ID}`);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Loading' }).first()).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('loading', { kind: 'PENDING' });
    read.flush(null, { status: 500, statusText: 'Server Error' });
    await opened.settled();
    await expect.element(view.getByText('This event could not be read.')).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });

  it('keeps the event on screen when its chain cannot be walked, with Retry', async () => {
    const opened = await open(EVENT_ID);
    await answerReads(opened, [`get ${CAUSE_ID}`]);
    const view = page.elementLocator(opened.page);
    await expect
      .element(view.getByRole('heading', { level: 2 }))
      .toMatchTextContent('BuildStatusChanged');
    await expect.element(view.getByText('This event’s chain could not be walked.')).toBeVisible();
    await expect.element(view.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect.element(view).toMatchTextContent('"phase": "VERIFY"');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('chain-error', { kind: 'ERROR' });
  });

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's.
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

  it('leave-project-event back: "← Events" leads back to the Events page', async () => {
    const opened = await render(EVENT_ID);
    await page.elementLocator(opened.page).getByRole('link', { name: '← Events' }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['leave-project-event:back']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/events`);
  });

  it('open-related-project-event cause: the cause opens its page', async () => {
    const opened = await render(EVENT_ID);
    await page.elementLocator(opened.page).getByRole('link', { name: CAUSE_ID }).click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-related-project-event:cause']);
    expect(TestBed.inject(Router).url).toBe(`/projects/${opened.project.slug}/events/${CAUSE_ID}`);
  });

  it('open-related-project-event chain: an effect in the chain opens its page', async () => {
    const opened = await render(EVENT_ID);
    const chain = page.elementLocator(opened.page).getByRole('table', { name: 'Chain' });
    // The last row: the effect …0004.
    await chain.getByRole('link').last().click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-related-project-event:chain']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/events/${EFFECT_IDS[0]}`,
    );
  });

  it('open-project-event-subject releaseRequest: a request the event names opens its page', async () => {
    const opened = await render(CAUSE_ID);
    const cause = await goldenMaster(CAUSE, 'getEvent', 'qits-events');
    const requestId = JSON.parse(cause.event.payload).releaseRequestId;
    await page
      .elementLocator(opened.page)
      .getByRole('link', { name: 'qits-ci-service-rr-12' })
      .click();
    await leftFor(opened);
    expect(reached()).toEqual(['open-project-event-subject:releaseRequest']);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/release-requests/${requestId}`,
    );
  });
});
