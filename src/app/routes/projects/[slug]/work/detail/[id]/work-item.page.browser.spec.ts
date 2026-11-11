import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent, type Locator } from 'vitest/browser';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';
import {
  answerWrapperClosings,
  WRAPPER_CLOSINGS,
} from '../../../../../../../testing/browser/recorded-work';

/**
 * Screenshots of one work item's page and its actions inside the shell (`openRoute`; the page sits
 * outside the work tabs), answered with qits-projects' golden masters and the archetype registry:
 *
 * - each archetype (and each ticket type) from its own detail state ("an epic in detail", …): the
 *   page as a whole, with the item's own reads (description, facts, dossier, comments);
 * - the actions bar for several statuses: the work of "a project with work in every status" and
 *   "an epic with features and tasks", whose states record no item reads (they answer 404, and only
 *   the actions are shot), and "an implemented ticket", in full. A press answers with the move or
 *   dispatch a move state recorded ("a refined epic", "a dropped ticket", …);
 * - a VERIFIED ticket's wrapper closing (qits-1873): the IN_FLIGHT ticket of "a project with
 *   VERIFIED tickets in every wrapper verdict", from its work, its `getWork` and its closings (the
 *   state records no thread or dossier: those answer 404);
 * - what an item needs (epic qits-1899): the READY_FOR_DEV ticket of "a ticket that needs another",
 *   its "needs" badge and its Needs panel, from its work and its `getWork` (no thread or dossier).
 *
 * The workspaces come from qits-workspaces' golden masters, whose ids are those of the "… in
 * detail" states: the open workspaces (a frame read `openRoute` answers) from "a project with
 * workspaces bound to work items", and each item's own (`answerWorkspaces`): the bug ticket's
 * history, and "a work item with no workspaces" for every other item.
 *
 * The page follows transitions through the event stream; the stream here never connects.
 *
 * The link of the one linking pattern only this page draws is a declared exit (epic qits-2000),
 * followed once: a workspace in the item's history (`app-work-workspaces`' `open-workspace-agent`
 * `open`, shown by `workspaces-history`). The page it leaves for is not this spec's: its reads are
 * answered with an error (`leftFor`).
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PROJECTS = 'https://projects.test';
const EVERY_STATUS = 'a project with work in every status';
const IMPLEMENTED = 'an implemented ticket';
/**
 * A READY_FOR_DEV ticket needing another ticket at VERIFIED, not met (epic qits-1899; recorded by
 * qits-projects from 2026.1106.140436 on).
 */
const NEEDS = 'a ticket that needs another';
/**
 * States over a seed of their own, whose frozen ids may also be ids qits-workspaces' bound state
 * names: no item there has a workspace (`answerWorkspaces`).
 */
const UNBOUND: ReadonlySet<string> = new Set([WRAPPER_CLOSINGS, NEEDS]);
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

  beforeEach(async () => {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1040, 600);
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        // Where the epic's dossier figures load from (stubbed: `stubFigure`).
        provideTestPlatformOrigins({ projects: PROJECTS }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    await page.viewport(800, 600);
  });

  /**
   * Answers the item's own reads (`WorkDetailStore`): from `state`'s recordings when `recorded`,
   * else with 404 (an error answer is a status only): the body then shows its children only. With
   * `'item'`, the item from `state`'s `getWork` and its thread and dossier 404 (a state recording
   * the item alone).
   */
  async function answerDetail(state: string, ref: string, recorded: boolean | 'item') {
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
    if (recorded === 'item') {
      thread.flush(null, { status: 404, statusText: 'Not Found' });
      await settle();
      http
        .match(`/projects/api/work/${ref}/dossier`)
        .forEach((read) => read.flush(null, { status: 404, statusText: 'Not Found' }));
      return;
    }
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
   * Answers the item's own workspaces: "a project with workspaces bound to work items"' list for
   * the item it records (the bug ticket), and for any other item "a work item with no workspaces"
   * (its answer names no id). In an `UNBOUND` state every item's workspaces are "a work item with no
   * workspaces" (and the open workspaces, `render`'s, "no work item has an open workspace").
   */
  async function answerWorkspaces(state: string) {
    await settle();
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
   * The page of the entity titled `title` in `state`'s recorded work, inside the shell
   * (`openRoute`), every request answered from a recording: the work from `state`, the wrapper
   * closings a VERIFIED ticket's line asks for (`answerWrapperClosings`), the item's own reads from
   * `state` when `detail` (`answerDetail`). Gives the page (`element`) and the frame around it.
   */
  async function render(state: string, title: string, detail: boolean | 'item' = false) {
    const work = await goldenMaster(state, 'listProjectWork');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/work/detail/${entity.qualifiedId}`,
      { workspaces: UNBOUND.has(state) ? 'no work item has an open workspace' : BOUND },
    );
    http.expectOne(`/projects/api/projects/${opened.project.id}/work`).flush(work);
    await opened.settled();
    await answerWrapperClosings(http, opened.project.id);
    // The page's actions come from the archetype registry.
    http
      .expectOne('/projects/api/work/archetypes')
      .flush(await goldenMaster('the archetype registry', 'listWorkArchetypes'));
    await answerDetail(state, entity.qualifiedId, detail);
    await answerWorkspaces(state);
    await opened.settled();
    const view = opened.frame.querySelector<HTMLElement>('app-work-item-page')!;
    return { element: page.elementLocator(view), frame: page.elementLocator(opened.frame), opened };
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * — its frame reads included — with a 404 (an error answer is only a status): that page is its
   * own spec's, so none of its reads may show as answered from a golden master in the route ledger
   * (`idle()`, not `settled()`, qits-2056). Answers in rounds, as a read may follow another's
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

  /** The outcomes the test reached, as their marks name them. */
  const reached = () => outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`);

  /**
   * Screenshots of a page's body, one per part, each named `<name>-<part>`: its facts, its
   * description, then each region it has (Features, Tasks, Dossier, Comments). A whole page is
   * taller than the viewport, and a taller viewport is scaled down to fit the test window, so each
   * part is shot on its own; a part taller than the viewport is shot child by child
   * (`<name>-<part>-<n>`). The actions bar is unpinned first: pinned, it would cover each part the
   * page scrolls to.
   */
  async function shootParts(element: Locator, name: string) {
    const root = element.element();
    (root.querySelector('[data-page-actions]') as HTMLElement).style.position = 'static';
    const parts: [string, Element | null][] = [
      ['facts', root.querySelector('app-work-fields:not(.hidden)')],
      ['description', root.querySelector('ui-markdown')],
      ...['Features', 'Tasks', 'Dossier', 'Comments'].map((region): [string, Element | null] => [
        region.toLowerCase(),
        root.querySelector(`section[aria-label=${region}]`),
      ]),
    ];
    for (const [part, found] of parts) await shoot(found, `${name}-${part}`);
  }

  /** Shoots `part`, or each of its children when it is taller than the viewport. */
  async function shoot(part: Element | null, name: string): Promise<void> {
    // A part with nothing in it (an item without a description) has no picture.
    if (!(part instanceof HTMLElement) || !part.offsetHeight) return;
    if (part.offsetHeight <= 560) {
      await expect.element(page.elementLocator(part)).toMatchScreenshot(name, { kind: 'DATA' });
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
      const { element } = await render(
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
      const { element } = await render(
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
      const { element } = await render(
        'a verified epic with every task implemented',
        'Verified epic',
      );
      const features = element.getByRole('region', { name: 'Features' });
      await expect.element(features.getByRole('link', { name: 'Shipped feature' })).toBeVisible();
      expect(features.element().querySelector('app-epic-board')).toBeNull();
      expect(features.element().querySelectorAll('app-feature-list-row')).toHaveLength(1);
      await expect
        .element(features)
        .toMatchScreenshot('detail-verified-epic-features', { kind: 'DATA' });
    });

    it('a feature: description, tasks, comments', async () => {
      const { element } = await render('a feature in detail', 'PDF export', true);
      // No "Depends on" any more (epic qits-1899): what it needs is the Needs panel.
      await expect.element(element).not.toMatchTextContent('Depends on');
      await expect
        .element(element.getByRole('region', { name: 'Tasks' }))
        .toMatchTextContent('Render one invoice as PDF');
      await expect.element(element).toMatchTextContent('Render one invoice as an A4 PDF');
      await expect
        .element(element.getByRole('region', { name: 'Comments' }))
        .toMatchTextContent('Started on the renderer.');
      await shootParts(element, 'detail-feature');
    });

    it('a task: repository, progress, description, comments', async () => {
      const { element } = await render(
        'a task in detail',
        'Download button on the invoice list',
        true,
      );
      await expect.element(element).toMatchTextContent('Implemented1 Jan 2026, 00:00');
      await expect.element(element).not.toMatchTextContent('Depends on');
      await expect
        .element(element.getByRole('region', { name: 'Features' }))
        .not.toBeInTheDocument();
      await shootParts(element, 'detail-task');
    });

    it.each([
      ['bug', 'a bug ticket in detail', 'Invoice totals are off by one cent', 'Affected invoices'],
      [
        'improvement',
        'an improvement ticket in detail',
        'Remember the last export format',
        'No pages yet',
      ],
      [
        'maintenance',
        'a maintenance ticket in detail',
        'Release request for billing-service is stuck',
        'What the platform saw',
      ],
    ])(
      'a %s ticket: its facts, description, dossier, comments',
      async (type, state, title, dossier) => {
        const { element } = await render(state, title, true);
        await expect.element(element).toMatchTextContent(`Type${type}`);
        await expect
          .element(element.getByRole('region', { name: 'Dossier' }))
          .toMatchTextContent(dossier);
        await shootParts(element, `detail-${type}-ticket`);
      },
    );
  });

  // qits-1873: a VERIFIED ticket's facts say how its wrapper closing stands, the request linked.
  it('a verified ticket riding a pending wrapper request', async () => {
    const { element } = await render(WRAPPER_CLOSINGS, 'Riding a pending wrapper request', 'item');
    const line = element.getByText('Closes with', { exact: false });
    await expect
      .element(line)
      .toHaveTextContent('Closes with contract-00000001-contract-00000001-rr-1, pending');
    await expect
      .element(line.getByRole('link', { name: 'contract-00000001-contract-00000001-rr-1' }))
      .toHaveAttribute(
        'href',
        '/projects/contract-00000001/release-requests/contract-00000001-contract-00000001-rr-1',
      );
    await expect
      .element(page.elementLocator(line.element().closest('p') as HTMLElement))
      .toMatchScreenshot('detail-ticket-wrapper-closing', { kind: 'DATA' });
  });

  // Epic qits-1899: the item's "needs" badge beside its facts, and its Needs panel below the body:
  // the needed ticket linked, at VERIFIED, now REFINED, not met.
  it('a ticket that needs another: its badge and its Needs panel', async () => {
    const { element } = await render(NEEDS, 'Render work ids in the list', 'item');
    const badge = element.getByText('needs 1');
    await expect.element(badge).toBeVisible();
    await expect
      .element(page.elementLocator(badge.element().closest('p') as HTMLElement))
      .toMatchScreenshot('detail-needs-facts', { kind: 'DATA' });
    const panel = element.getByRole('region', { name: 'Needs' });
    await expect
      .element(panel.getByRole('link', { name: 'Ticket: contract-00000001-1' }))
      .toHaveAttribute('href', '/projects/contract-00000001/work/detail/contract-00000001-1');
    await expect.element(panel).toMatchTextContent('at verified');
    await expect.element(panel).toMatchTextContent('(now refined)');
    await expect.element(panel).toMatchTextContent('not met');
    await commands.parkPointer();
    await expect.element(panel).toMatchScreenshot('detail-needs-panel', { kind: 'DATA' });
  });

  describe('workspaces', () => {
    /** The Workspaces region. */
    const workspacesOf = (element: Locator) => element.getByRole('region', { name: 'Workspaces' });

    it('open-workspace-agent open: a workspace leads to the item’s agent', async () => {
      const work = await goldenMaster('a bug ticket in detail', 'listProjectWork');
      const qualifiedId = work.entities.find(
        (e: { title: string }) => e.title === 'Invoice totals are off by one cent',
      ).qualifiedId;
      const { element, opened } = await render(
        'a bug ticket in detail',
        'Invoice totals are off by one cent',
        true,
      );
      await workspacesOf(element).getByRole('listitem').nth(0).getByRole('link').click();
      await leftFor(opened);
      // The agent address then leads on by itself (`follow-work-item-agent`, its own spec's).
      expect(reached()[0]).toBe('open-workspace-agent:open');
      expect(outcomeRecords()[0].url).toBe(
        `/projects/${opened.project.slug}/work/detail/${qualifiedId}/agent`,
      );
    });

    it('a ticket’s workspaces in every state, newest first', async () => {
      // The ticket's own number comes from the recording, which renumbers it.
      const work = await goldenMaster('a bug ticket in detail', 'listProjectWork');
      const qualifiedId = work.entities.find(
        (e: { title: string }) => e.title === 'Invoice totals are off by one cent',
      ).qualifiedId;
      const { element } = await render(
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
        .toHaveAttribute('href', `/projects/contract-00000001/work/detail/${qualifiedId}/agent`);
      await expect.element(region).toMatchScreenshot('workspaces-history', { kind: 'DATA' });
    });

    it('an item with no workspaces', async () => {
      const { element } = await render(
        'an improvement ticket in detail',
        'Remember the last export format',
        true,
      );
      const region = workspacesOf(element);
      await expect.element(region).toMatchTextContent('No workspaces yet');
      expect(region.getByRole('listitem').elements()).toHaveLength(0);
      await expect.element(region).toMatchScreenshot('workspaces-none', { kind: 'NO_DATA' });
    });
  });

  describe('actions, as the registry serves them', () => {
    it('a reported ticket: every group', async () => {
      const { element } = await render(EVERY_STATUS, 'Reported ticket');
      await agentButtons(element, ['Dispatch', 'Refine']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark refined Drop Block');
      await expect
        .element(element.getByRole('group', { name: 'Plan' }))
        .toMatchTextContent('Edit Reshape Refinement room');
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-reported-ticket', { kind: 'DATA' });
    });

    // qits-150: qits-projects-service refuses every caller's move of a TICKET to DONE, so the
    // registry's "Mark done" move is held back for a ticket; only the platform uses it.
    it('a verified ticket: its moves only, with no Mark done', async () => {
      const { element } = await render(EVERY_STATUS, 'Verified ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Back to verifying Drop');
      expect(element.getByRole('group').elements()).toHaveLength(1);
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-verified-ticket', { kind: 'DATA' });
    });

    it('done work: nothing', async () => {
      const { element } = await render(EVERY_STATUS, 'Done epic');
      await expect.element(element.getByRole('heading', { level: 1 })).toMatchTextContent('Done');
      // No action: the thread's own buttons (Comment, Edit) and the Needs panel's (Add a need:
      // needs stay editable at every status) are not actions.
      const actions = element
        .getByRole('button')
        .elements()
        .filter((button) => !button.closest('app-work-comments, app-work-needs-panel'));
      expect(actions).toHaveLength(0);
    });

    it('a scheduled feature: its own moves, nothing to dispatch', async () => {
      const { element } = await render('an epic with features and tasks', 'Open feature');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark implementing Skip to implemented Back to refined Drop');
      expect(element.getByRole('group', { name: 'Agent' }).elements()).toHaveLength(0);
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-scheduled-feature', { kind: 'DATA' });
    });

    it('an implemented ticket: the verify phase, its flow, and the move to VERIFYING', async () => {
      const { element } = await render(
        IMPLEMENTED,
        'Database runs out of connection slots during deploys',
        true,
      );
      await agentButtons(element, ['Dispatch', 'Verify']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Mark verifying Skip to verified Back to implementing Drop Block');
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-implemented-ticket', { kind: 'DATA' });

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
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-verifying-ticket', { kind: 'DATA' });
    });

    it('an implementing epic: Dispatch lists the flow it runs', async () => {
      // Tall enough for the whole page: the shell shows only what is in the viewport.
      await page.viewport(1040, 2650);
      await commands.stubFigure(`${PROJECTS}/projects/api/work/*/dossier-assets/*/content`);
      const { element, frame } = await render(
        'an epic in detail',
        'Export invoices for the accountants',
        true,
      );
      await userEvent.hover(element.getByRole('button', { name: 'Dispatch' }));
      await expect
        .element(element.getByRole('tooltip'))
        .toMatchTextContent('Runsimplement → IMPLEMENTEDverify → VERIFIED');
      await expect
        .element(frame)
        .toMatchScreenshot('actions-implementing-epic-runs', { kind: 'DATA' });
    });

    it('a refined epic offers Dispatch (qits-1075)', async () => {
      const { element } = await render(EVERY_STATUS, 'Refined epic');
      // A person's Dispatch pre-approves the scheduling, running the whole flow in one press.
      await agentButtons(element, ['Dispatch']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Mark ready for dev Back to reported Drop Block');
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-refined-epic', { kind: 'DATA' });
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
      const { element } = await render(EVERY_STATUS, 'Ready for dev epic');
      await agentButtons(element, ['Dispatch', 'Implement']);
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-ready-for-dev-epic', { kind: 'DATA' });
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
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-implementing-epic', { kind: 'DATA' });
    });

    it('a dropped ticket: Reopen, back to REPORTED', async () => {
      const { element } = await render(EVERY_STATUS, 'Dropped ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toMatchTextContent('Status Reopen');
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-dropped-ticket', { kind: 'DATA' });
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
      await expect
        .element(actionsOf(element))
        .toMatchScreenshot('actions-reopened-ticket', { kind: 'DATA' });
    });
  });

  // qits-1913: a long inline-code path in the description or a comment, and a workspace row's
  // dates, used to scroll the whole page sideways on a phone; `ui-markdown` and
  // `app-work-workspaces` now keep them inside the column. No recorded answer carries a code path
  // that long, so the real page renders with the real golden master first (as every other case
  // here), and the description's and a comment's rendered markdown are then swapped directly in
  // the DOM for one that holds it (as qits-1864 does for a long item word). The bug ticket is
  // used on purpose: it is the one item whose workspaces bind to "a project with workspaces bound
  // to work items" (`answerWorkspaces`), so its real rows (with their "Opened …· Closed …" dates)
  // are on screen too, and the assertion below proves every part of a real ticket page fits.
  it('keeps a long inline-code path, and a workspace row’s dates, on screen at 390px (qits-1913)', async () => {
    await page.viewport(390, 844);
    const state = 'a bug ticket in detail';
    const title = 'Invoice totals are off by one cent';

    const { element } = await render(state, title, true);
    const root = element.element();

    const path =
      'src/app/layout/shell/__screenshots__/shell.layout.browser.spec.ts/menu-agents-phone-chromium-linux.png';

    const description = root.querySelector('ui-markdown > div') as HTMLElement;
    description.innerHTML = `<p>See <code>${path}</code> for the baseline.</p>`;
    const comment = root.querySelector(
      'section[aria-label=Comments] ui-markdown > div',
    ) as HTMLElement;
    comment.innerHTML = `<p>Also see <code>${path}</code>.</p>`;

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
});
