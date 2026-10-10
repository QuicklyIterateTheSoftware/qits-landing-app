import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page, userEvent, type Locator } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { WorkItemPage } from './work-item.page';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../../../../testing/browser/recorded-work';
import type { CampaignReads } from '../../../../../../../testing/campaign-reads';
import { shootMembers } from '../../../../../../../testing/browser/shoot-members';

/**
 * Screenshots of one work item's page and its actions, answered with qits-projects' golden masters
 * and the archetype registry:
 *
 * - each archetype (and each ticket type) from its own detail state ("an epic in detail", …): the
 *   page as a whole, with the item's own reads (description, facts, dossier, comments);
 * - the actions bar for several statuses: the work of "a project with work in every status" and
 *   "an epic with features and tasks", whose states record no item reads (they answer 404, and only
 *   the actions are shot), and "an implemented ticket", in full. A press answers with the move or
 *   dispatch a move state recorded ("a refined epic", "a dropped ticket", …).
 *
 * The workspaces come from qits-workspaces' golden masters (`answerWorkspaces`), whose ids are
 * those of the "… in detail" states: the bug ticket's history, and "a work item with no
 * workspaces" for every other item.
 *
 * The page follows transitions through the event stream; the stream here never connects.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PROJECTS = 'https://projects.test';
const EVERY_STATUS = 'a project with work in every status';
const IMPLEMENTED = 'an implemented ticket';
/**
 * The detail states share one seed and its frozen ids; those that record no campaign read answer
 * it from this one. It is also the one of them that records the campaign's `getWork` (its
 * description).
 */
const CAMPAIGN = 'a campaign in detail';
/**
 * A campaign whose members are a DONE ticket, a DONE epic, a VERIFIED epic, an IMPLEMENTING epic
 * and a REFINED ticket, with the campaign's own reads.
 */
const PAST_THE_BOARD = 'a campaign with a done, a verified and an implementing epic';
/**
 * States over a seed of their own, whose frozen ids are also ids qits-workspaces' bound state names
 * (the VERIFIED epic's is the PDF feature's, the campaign's the bug ticket's): no item there has a
 * workspace (`answerWorkspaces`).
 */
const UNBOUND: ReadonlySet<string> = new Set([PAST_THE_BOARD]);

/**
 * Where a state's campaign reads are answered from (`openRecordedWork`): the members from
 * `members` (by default the state's own), the description from the state of that seed that records
 * the campaign's `getWork`.
 */
const campaignReads = (state: string, members = state): CampaignReads => ({
  members,
  described: [state === PAST_THE_BOARD ? PAST_THE_BOARD : CAMPAIGN],
});
/** qits-workspaces' states. */
const BOUND = 'a project with workspaces bound to work items';
const NONE = 'a work item with no workspaces';

/** Waits until every image in `element` has loaded (the stubbed figure). */
async function figuresLoaded(element: Locator) {
  await Promise.all(
    [...element.element().querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : new Promise((done) => img.addEventListener('load', done)),
    ),
  );
}

describe('WorkItemPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/detail/:id', component: WorkItemPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        // Where the epic's dossier figures load from (stubbed: `stubFigure`).
        provideTestPlatformOrigins({ projects: PROJECTS }),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * Answers the item's own reads (`WorkDetailStore`): from `state`'s recordings when `recorded`,
   * else with 404 (an error answer is a status only): the body then shows its children only.
   */
  async function answerDetail(state: string, ref: string, recorded: boolean) {
    // A campaign's own read has the URL of the work list's read of its description, which
    // `openRecordedWork` may have answered already, with the same recording.
    const items = http.match(`/projects/api/work/${ref}`);
    expect(items.length).toBeLessThanOrEqual(1);
    const thread = http.expectOne(`/projects/api/work/${ref}/comments`);
    if (!recorded) {
      items[0]?.flush(null, { status: 404, statusText: 'Not Found' });
      thread.flush(null, { status: 404, statusText: 'Not Found' });
      return;
    }
    const entity = await goldenMaster(state, 'getWork');
    items[0]?.flush(entity);
    thread.flush(await goldenMaster(state, 'listWorkComments'));
    await settle();
    if (entity.archetype === 'EPIC') {
      http
        .expectOne(`/projects/api/work/${ref}/dossier`)
        .flush(await goldenMaster(state, 'listWorkDossier'));
      http
        .expectOne(`/projects/api/work/${ref}/dossier-assets`)
        .flush(await goldenMaster(state, 'listWorkDossierAssets'));
    }
    if (entity.archetype === 'TICKET') {
      const dossier = http.expectOne(`/projects/api/work/${ref}/dossier`);
      // "an implemented ticket" records no dossier: its body fails to load, its actions show.
      if (state === IMPLEMENTED) dossier.flush(null, { status: 404, statusText: 'Not Found' });
      else dossier.flush(await goldenMaster(state, 'listWorkDossier'));
    }
  }

  /**
   * Answers the open workspaces from "a project with workspaces bound to work items", and the
   * item's own workspaces: that state's list for the item it records (the bug ticket), and for any
   * other item "a work item with no workspaces" (its answer names no id). In an `UNBOUND` state the
   * open workspaces are "no work item has an open workspace" and every item's workspaces are "a work
   * item with no workspaces".
   */
  async function answerWorkspaces(state: string) {
    await settle();
    const open = http.expectOne('/workspaces/api/work/workspaces');
    open.flush(
      await goldenMaster(
        UNBOUND.has(state) ? 'no work item has an open workspace' : BOUND,
        'listOpenWorkspaces',
        'qits-workspaces',
      ),
    );
    const bug = (await goldenMaster('a bug ticket in detail', 'getWork')).id;
    for (const read of http.match((r) =>
      /^\/workspaces\/api\/work\/[^/]+\/workspaces$/.test(r.url),
    )) {
      const bound = !UNBOUND.has(state) && read.request.url.split('/')[4] === bug;
      read.flush(
        await goldenMaster(bound ? BOUND : NONE, 'listWorkItemWorkspaces', 'qits-workspaces'),
      );
    }
  }

  /**
   * The page of the entity titled `title` in `state`'s recorded work, every request answered from
   * a recording (`openRecordedWork`: a campaign's reads too, as `campaigns` says), the item's own
   * reads from `state` when `detail` (`answerDetail`).
   */
  async function render(
    state: string,
    title: string,
    detail = false,
    campaigns: CampaignReads = campaignReads(state),
  ) {
    const work = await goldenMaster(state, 'listProjectWork');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const { element, harness } = await openRecordedWork(
      http,
      'work/detail',
      entity.qualifiedId,
      state,
      campaigns,
    );
    // The page's actions come from the archetype registry.
    http
      .expectOne('/projects/api/work/archetypes')
      .flush(await goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await answerDetail(state, entity.qualifiedId, detail);
    await answerWorkspaces(state);
    await settle();
    await settle();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    element.style.width = '760px';
    return page.elementLocator(element);
  }

  /**
   * Screenshots of a page's body, one per part, each named `<name>-<part>`: its facts, its
   * description, then each region it has (Features, Tasks, Members, Dossier, Comments). A whole
   * page is taller than the viewport, and a taller viewport is scaled down to fit the test window,
   * so each part is shot on its own; a part taller than the viewport is shot child by child
   * (`<name>-<part>-<n>`). A campaign's Members are shot member by member (`shootMembers`:
   * `<name>-members-<n>`), whatever their height: a list item's host has no box of its own. The
   * actions bar is unpinned first: pinned, it would cover each part the page scrolls to.
   */
  async function shootParts(element: Locator, name: string) {
    const root = element.element();
    (root.querySelector('[data-page-actions]') as HTMLElement).style.position = 'static';
    const parts: [string, Element | null][] = [
      ['facts', root.querySelector('app-work-fields:not(.hidden)')],
      ['description', root.querySelector('ui-markdown')],
      ...['Features', 'Tasks', 'Members', 'Dossier', 'Comments'].map(
        (region): [string, Element | null] => [
          region.toLowerCase(),
          root.querySelector(`section[aria-label=${region}]`),
        ],
      ),
    ];
    for (const [part, found] of parts) {
      const list = part === 'members' ? found?.querySelector('app-work-list') : null;
      if (list) await shootMembers(list, `${name}-members`);
      else await shoot(found, `${name}-${part}`);
    }
  }

  /** Shoots `part`, or each of its children when it is taller than the viewport. */
  async function shoot(part: Element | null, name: string): Promise<void> {
    // A part with nothing in it (an item without a description) has no picture.
    if (!(part instanceof HTMLElement) || !part.offsetHeight) return;
    if (part.offsetHeight <= 560) {
      await expect.element(page.elementLocator(part)).toMatchScreenshot(name);
      return;
    }
    const children = [...part.children].filter(
      (child) => child instanceof HTMLElement && child.offsetHeight,
    );
    // `display: contents` children (the list items) have no box of their own: go one deeper.
    const boxes = children.length
      ? children
      : [...part.children].flatMap((child) => [...child.children]);
    for (const [i, child] of boxes.entries()) await shoot(child, `${name}-${i + 1}`);
  }

  /** The page's actions bar: what the action screenshots show. */
  const actionsOf = (element: Locator) =>
    page.elementLocator(element.element().querySelector('[data-page-actions]') as HTMLElement);

  /** Presses the button labelled `label`, and returns the request it sent. */
  async function press(element: Locator, label: string, url: string) {
    await userEvent.click(element.getByRole('button', { name: label, exact: true }));
    await settle();
    const request = http.expectOne(url);
    return request;
  }

  /** The Agent group holds exactly these buttons (by name: Dispatch's popover is text too). */
  async function agentButtons(element: Locator, names: readonly string[]) {
    const agent = element.getByRole('group', { name: 'Agent' });
    for (const name of names) {
      await expect.element(agent.getByRole('button', { name, exact: true })).toBeVisible();
    }
    expect(agent.getByRole('button').elements()).toHaveLength(names.length);
  }

  /** Lets an answer reach the page. */
  async function answered() {
    await settle();
    await settle();
    await commands.parkPointer();
  }

  describe('each archetype, from its own detail state', () => {
    beforeEach(async () => {
      // The epic's dossier figure: its bytes are not recorded, so a grey stand-in.
      await commands.stubFigure(`${PROJECTS}/projects/api/work/*/dossier-assets/*/content`);
    });

    it('an epic: description, features, dossier with its figure, comments', async () => {
      const element = await render(
        'an epic in detail',
        'Export invoices for the accountants',
        true,
      );
      await expect.element(element.getByRole('heading', { name: 'Why' })).toBeVisible();
      const features = element.getByRole('region', { name: 'Features' });
      await expect.element(features.getByRole('link', { name: 'CSV export' })).toBeVisible();
      const dossier = element.getByRole('region', { name: 'Dossier' });
      await expect.element(dossier).toMatchTextContent('Data flow');
      await expect
        .element(dossier.getByRole('img', { name: 'Export data flow' }))
        .toHaveAttribute(
          'src',
          expect.stringMatching(/^https:\/\/projects\.test\/projects\/api\//),
        );
      await expect
        .element(element.getByRole('region', { name: 'Comments' }))
        .toMatchTextContent('Agreed. Start with the CSV export.');
      await figuresLoaded(element);
      await shootParts(element, 'detail-epic');
    });

    it('an epic on the board: its features are its own board, five columns', async () => {
      const element = await render(
        'an epic in detail',
        'Export invoices for the accountants',
        true,
      );
      const features = element.getByRole('region', { name: 'Features' });
      const headings = [
        ...features.element().querySelectorAll('ui-board > div:first-child > div'),
      ].map((h) => h.textContent?.replace(/\d+/g, '').trim());
      expect(headings.filter(Boolean)).toEqual([
        'Ready for Dev',
        'Implementing',
        'Implemented',
        'Verifying',
        'Verified',
      ]);
      // The page names the epic already: the board has no bar of its own.
      expect(features.element().querySelector('app-epic-board header')).toBeNull();
      expect(features.element().querySelectorAll('ui-board-row')).toHaveLength(2);
      expect(features.element().querySelector('app-feature-list-row')).toBeNull();
    });

    it('an epic off the board: its features as rows, as before', async () => {
      const element = await render('a verified epic with every task implemented', 'Verified epic');
      const features = element.getByRole('region', { name: 'Features' });
      await expect.element(features.getByRole('link', { name: 'Shipped feature' })).toBeVisible();
      expect(features.element().querySelector('app-epic-board')).toBeNull();
      expect(features.element().querySelectorAll('app-feature-list-row')).toHaveLength(1);
      await expect.element(features).toMatchScreenshot('detail-verified-epic-features');
    });

    it('a feature: its dependency, description, tasks, comments', async () => {
      const element = await render(
        'a feature in detail',
        'PDF export',
        true,
        campaignReads('a feature in detail', CAMPAIGN),
      );
      await expect
        .element(element.getByRole('link', { name: 'contract-00000001-3 · CSV export' }))
        .toBeVisible();
      await expect
        .element(element.getByRole('region', { name: 'Tasks' }))
        .toMatchTextContent('Render one invoice as PDF');
      await expect.element(element).toMatchTextContent('Render one invoice as an A4 PDF');
      await expect
        .element(element.getByRole('region', { name: 'Comments' }))
        .toMatchTextContent('Started on the renderer.');
      await shootParts(element, 'detail-feature');
    });

    it('a task: repository, progress, dependency, description, comments', async () => {
      const element = await render(
        'a task in detail',
        'Download button on the invoice list',
        true,
        campaignReads('a task in detail', CAMPAIGN),
      );
      await expect.element(element).toMatchTextContent('Implemented1 Jan 2026, 00:00');
      await expect
        .element(
          element.getByRole('link', { name: 'contract-00000001-4 · Stream invoices as CSV' }),
        )
        .toBeVisible();
      await expect
        .element(element.getByRole('region', { name: 'Features' }))
        .not.toBeInTheDocument();
      await shootParts(element, 'detail-task');
    });

    it.each([
      [
        'bug',
        'a bug ticket in detail',
        'Invoice totals are off by one cent',
        [],
        'Affected invoices',
      ],
      [
        'improvement',
        'an improvement ticket in detail',
        'Remember the last export format',
        [],
        'No pages yet',
      ],
      [
        'maintenance',
        'a maintenance ticket in detail',
        'Release request for billing-service is stuck',
        [CAMPAIGN],
        'What the platform saw',
      ],
    ])(
      'a %s ticket: its facts, description, dossier, comments',
      async (type, state, title, campaigns, dossier) => {
        const element = await render(
          state,
          title,
          true,
          campaignReads(state, campaigns.length ? campaigns[0] : state),
        );
        await expect.element(element).toMatchTextContent(`Type${type}`);
        await expect
          .element(element.getByRole('region', { name: 'Dossier' }))
          .toMatchTextContent(dossier);
        await shootParts(element, `detail-${type}-ticket`);
      },
    );

    it('a campaign: description, members, comments, and its start', async () => {
      const element = await render(CAMPAIGN, 'Invoicing for the Q4 close', true);
      await expect.element(element.getByRole('heading', { name: 'Done when' })).toBeVisible();
      await expect
        .element(element.getByRole('region', { name: 'Members' }))
        .toMatchTextContent('Tax rates per country');
      await expect
        .element(element.getByRole('group', { name: 'Agent' }))
        .toMatchTextContent('Start campaign');
      await shootParts(element, 'detail-campaign');
    });

    it('a campaign past the board: only its implementing epic has its own board', async () => {
      const element = await render(PAST_THE_BOARD, 'Campaign in flight', true);
      const members = element.getByRole('region', { name: 'Members' }).element();
      const drawn = [
        ...members.querySelectorAll('app-ticket-list-item, app-epic-list-item, app-epic-board'),
      ].map((member) => [member.tagName.toLowerCase(), member.textContent ?? '']);
      expect(drawn.map(([tag]) => tag)).toEqual([
        'app-ticket-list-item',
        'app-epic-list-item',
        'app-epic-list-item',
        'app-epic-board',
        'app-ticket-list-item',
      ]);
      const titles = [
        'Done ticket',
        'Done epic',
        'Verified epic',
        'Epic with mixed features',
        'Refined ticket',
      ];
      drawn.forEach(([, text], i) => expect(text).toContain(titles[i]));
      expect(
        members.querySelector('app-epic-board')!.querySelectorAll('ui-board-row'),
      ).toHaveLength(4);
      // No member has a workspace.
      expect(members.querySelectorAll('app-workspace-link:not(.hidden) a')).toHaveLength(0);

      // Each lane's id is whole inside its strip, however short the lane.
      for (const id of members.querySelectorAll('app-epic-list-item a[lane-gutter]')) {
        const strip = id.parentElement!.parentElement!.getBoundingClientRect();
        const box = id.getBoundingClientRect();
        expect(box.height).toBeGreaterThan(0);
        expect(box.top).toBeGreaterThanOrEqual(strip.top);
        expect(box.bottom).toBeLessThanOrEqual(strip.bottom);
      }
      // The campaign's own reads are recorded: the page loads whole.
      await expect
        .element(element)
        .toMatchTextContent('Ships two tickets and three epics, one after the other.');
      expect(element.getByRole('img', { name: 'Failed to load' }).elements()).toHaveLength(0);
      await shootParts(element, 'detail-campaign-done-verified-implementing');
    });
  });

  describe('workspaces', () => {
    /** The Workspaces region. */
    const workspacesOf = (element: Locator) => element.getByRole('region', { name: 'Workspaces' });

    it('a ticket’s workspaces in every state, newest first', async () => {
      const element = await render(
        'a bug ticket in detail',
        'Invoice totals are off by one cent',
        true,
      );
      const region = workspacesOf(element);
      const rows = region.getByRole('listitem');
      expect(rows.elements()).toHaveLength(3);
      await expect.element(rows.nth(0)).toMatchTextContent(/^active/);
      await expect.element(rows.nth(1)).toMatchTextContent(/^integrated.*Closed/);
      await expect.element(rows.nth(2)).toMatchTextContent(/^abandoned.*Closed/);
      await expect
        .element(rows.nth(0).getByRole('link'))
        .toHaveAttribute('href', '/projects/contract-00000001/workspaces/contract-00000001-10');
      await expect.element(region).toMatchScreenshot('workspaces-history');
    });

    it('an item with no workspaces', async () => {
      const element = await render(
        'an improvement ticket in detail',
        'Remember the last export format',
        true,
      );
      const region = workspacesOf(element);
      await expect.element(region).toMatchTextContent('No workspaces yet');
      expect(region.getByRole('listitem').elements()).toHaveLength(0);
      await expect.element(region).toMatchScreenshot('workspaces-none');
    });
  });

  describe('actions, as the registry serves them', () => {
    it('a reported ticket: every group', async () => {
      const element = await render(EVERY_STATUS, 'Reported ticket');
      await agentButtons(element, ['Dispatch', 'Refine']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark refined Drop Block');
      await expect
        .element(element.getByRole('group', { name: 'Plan' }))
        .toMatchTextContent('Edit Reshape Refinement room');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-reported-ticket');
    });

    it('a verified ticket: its moves only', async () => {
      const element = await render(EVERY_STATUS, 'Verified ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Mark done Back to verifying Drop');
      expect(element.getByRole('group').elements()).toHaveLength(1);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-verified-ticket');
    });

    it('done work: nothing', async () => {
      const element = await render(EVERY_STATUS, 'Done epic');
      await expect.element(element.getByRole('heading', { level: 1 })).toMatchTextContent('Done');
      expect(element.getByRole('button').elements()).toHaveLength(0);
    });

    it('a scheduled feature: its own moves, nothing to dispatch', async () => {
      const element = await render('an epic with features and tasks', 'Open feature');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark implementing Skip to implemented Back to refined Drop');
      expect(element.getByRole('group', { name: 'Agent' }).elements()).toHaveLength(0);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-scheduled-feature');
    });

    it('an implemented ticket: the verify phase, its flow, and the move to VERIFYING', async () => {
      const element = await render(
        IMPLEMENTED,
        'Database runs out of connection slots during deploys',
        true,
      );
      await agentButtons(element, ['Dispatch', 'Verify']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark verifying Skip to verified Back to implementing Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-implemented-ticket');

      // The next phase: one phase, PHASE.
      const ref = (await goldenMaster(IMPLEMENTED, 'getWork')).qualifiedId;
      const dispatched = await press(element, 'Verify', `/projects/api/work/${ref}/dispatch`);
      expect(dispatched.request.body).toEqual({ mode: 'PHASE' });
      dispatched.flush(await goldenMaster(IMPLEMENTED, 'dispatchWork'));
      await answered();

      const moved = await press(element, 'Mark verifying', `/projects/api/work/${ref}/status`);
      expect(moved.request.body).toEqual({ target: 'VERIFYING' });
      moved.flush(await goldenMaster(IMPLEMENTED, 'setWorkStatus'));
      await answered();
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark verified Back to implemented Drop Block');
      await expect.element(element).toMatchTextContent('ticket · verifying');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-verifying-ticket');
    });

    it('an implementing epic: Dispatch lists the flow it runs', async () => {
      await commands.stubFigure(`${PROJECTS}/projects/api/work/*/dossier-assets/*/content`);
      const element = await render(
        'an epic in detail',
        'Export invoices for the accountants',
        true,
      );
      await userEvent.hover(element.getByRole('button', { name: 'Dispatch' }));
      await expect
        .element(element.getByRole('tooltip'))
        .toMatchTextContent('Runsimplement → IMPLEMENTEDverify → VERIFIED');
      await expect.element(element).toMatchScreenshot('actions-implementing-epic-runs');
    });

    it('a refined epic offers Dispatch (qits-1075)', async () => {
      const element = await render(EVERY_STATUS, 'Refined epic');
      // A person's Dispatch pre-approves the scheduling, running the whole flow in one press.
      await agentButtons(element, ['Dispatch']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Mark ready for dev Back to reported Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-refined-epic');
      const work = await goldenMaster(EVERY_STATUS, 'listProjectWork');
      const ref = work.entities.find(
        (e: { title: string }) => e.title === 'Refined epic',
      ).qualifiedId;
      const moved = await press(element, 'Mark ready for dev', `/projects/api/work/${ref}/status`);
      expect(moved.request.body).toEqual({ target: 'READY_FOR_DEV' });
      // "a refined epic" records this move; its epic is another seed's, so only its status counts.
      moved.flush(await goldenMaster('a refined epic', 'setWorkStatus'));
      await answered();
      await agentButtons(element, ['Dispatch', 'Implement']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark implementing Skip to implemented Back to refined Drop Block');
    });

    it('a ready for dev epic: the implement phase, and the move to IMPLEMENTING', async () => {
      const element = await render(EVERY_STATUS, 'Ready for dev epic');
      await agentButtons(element, ['Dispatch', 'Implement']);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-ready-for-dev-epic');
      const work = await goldenMaster(EVERY_STATUS, 'listProjectWork');
      const ref = work.entities.find(
        (e: { title: string }) => e.title === 'Ready for dev epic',
      ).qualifiedId;
      const moved = await press(element, 'Mark implementing', `/projects/api/work/${ref}/status`);
      expect(moved.request.body).toEqual({ target: 'IMPLEMENTING' });
      // "a ready for dev epic" records this move; its epic is another seed's, so only its status
      // counts.
      moved.flush(await goldenMaster('a ready for dev epic', 'setWorkStatus'));
      await answered();
      // IMPLEMENTING has no move back (qits-887).
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark implemented Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-implementing-epic');
    });

    it('a dropped ticket: Reopen, back to REPORTED', async () => {
      const element = await render(EVERY_STATUS, 'Dropped ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Reopen');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-dropped-ticket');
      const work = await goldenMaster(EVERY_STATUS, 'listProjectWork');
      const ref = work.entities.find(
        (e: { title: string }) => e.title === 'Dropped ticket',
      ).qualifiedId;
      const moved = await press(element, 'Reopen', `/projects/api/work/${ref}/status`);
      expect(moved.request.body).toEqual({ target: 'REPORTED' });
      moved.flush(await goldenMaster('a dropped ticket', 'setWorkStatus'));
      await answered();
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark refined Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-reopened-ticket');
    });
  });
});
