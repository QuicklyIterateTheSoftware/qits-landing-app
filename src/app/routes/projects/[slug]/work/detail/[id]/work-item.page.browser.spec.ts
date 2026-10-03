import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { commands, page, userEvent, type Locator } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { WorkItemPage } from './work-item.page';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import { openRecordedWork } from '../../../../../../../testing/browser/recorded-work';

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
 * The page follows transitions through the event stream; the stream here never connects.
 */

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const PROJECTS = 'https://projects.test';
const EVERY_STATUS = 'a project with work in every status';
const IMPLEMENTED = 'an implemented ticket';
/**
 * The detail states share one seed and its frozen ids; those that record no campaign read answer
 * it from this one.
 */
const CAMPAIGN = 'a campaign in detail';

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
    const item = http.expectOne(`/projects/api/entities/${ref}`);
    const thread = http.expectOne(`/projects/api/entities/${ref}/comments`);
    if (!recorded) {
      item.flush(null, { status: 404, statusText: 'Not Found' });
      thread.flush(null, { status: 404, statusText: 'Not Found' });
      return;
    }
    const entity = await goldenMaster(state, 'getEntity');
    item.flush(entity);
    thread.flush(await goldenMaster(state, 'listEntityComments'));
    await settle();
    if (entity.archetype === 'EPIC') {
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier`)
        .flush(await goldenMaster(state, 'listEpicDossierPages'));
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier-assets`)
        .flush(await goldenMaster(state, 'listEpicDossierAssets'));
    }
    if (entity.archetype === 'TICKET') {
      const dossier = http.expectOne(`/projects/api/tickets/${entity.id}/dossier`);
      // "an implemented ticket" records no dossier: its body fails to load, its actions show.
      if (state === IMPLEMENTED) dossier.flush(null, { status: 404, statusText: 'Not Found' });
      else dossier.flush(await goldenMaster(state, 'listTicketDossierPages'));
    }
  }

  /**
   * The page of the entity titled `title` in `state`'s recorded work, every request answered from
   * a recording (`openRecordedWork`: a campaign's read too, from `campaignStates`), the item's own
   * reads from `state` when `detail` (`answerDetail`).
   */
  async function render(
    state: string,
    title: string,
    detail = false,
    campaignStates: readonly string[] = [state],
  ) {
    const work = await goldenMaster(state, 'listProjectEntities');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const { element, harness } = await openRecordedWork(
      http,
      'work/detail',
      entity.qualifiedId,
      state,
      campaignStates,
    );
    // The page's actions come from the archetype registry.
    http
      .expectOne('/projects/api/entities/archetypes')
      .flush(await goldenMaster('the archetype registry', 'listArchetypes'));
    await answerDetail(state, entity.qualifiedId, detail);
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
   * (`<name>-<part>-<n>`). The actions bar is unpinned first: pinned, it would cover each part
   * the page scrolls to.
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
    for (const [part, found] of parts) await shoot(found, `${name}-${part}`);
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
      await commands.stubFigure(`${PROJECTS}/projects/api/epics/*/dossier-assets/*/content`);
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
      await expect.element(dossier).toHaveTextContent('Data flow');
      await expect
        .element(dossier.getByRole('img', { name: 'Export data flow' }))
        .toHaveAttribute(
          'src',
          expect.stringMatching(/^https:\/\/projects\.test\/projects\/api\//),
        );
      await expect
        .element(element.getByRole('region', { name: 'Comments' }))
        .toHaveTextContent('Agreed. Start with the CSV export.');
      await figuresLoaded(element);
      await shootParts(element, 'detail-epic');
    });

    it('a feature: its dependency, description, tasks, comments', async () => {
      const element = await render('a feature in detail', 'PDF export', true, [CAMPAIGN]);
      await expect
        .element(element.getByRole('link', { name: 'contract-00000001-3 · CSV export' }))
        .toBeVisible();
      await expect
        .element(element.getByRole('region', { name: 'Tasks' }))
        .toHaveTextContent('Render one invoice as PDF');
      await expect.element(element).toHaveTextContent('Render one invoice as an A4 PDF');
      await expect
        .element(element.getByRole('region', { name: 'Comments' }))
        .toHaveTextContent('Started on the renderer.');
      await shootParts(element, 'detail-feature');
    });

    it('a task: repository, progress, dependency, description, comments', async () => {
      const element = await render(
        'a task in detail',
        'Download button on the invoice list',
        true,
        [CAMPAIGN],
      );
      await expect.element(element).toHaveTextContent('Implemented1 Jan 2026, 00:00');
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
        const element = await render(state, title, true, campaigns.length ? campaigns : [state]);
        await expect.element(element).toHaveTextContent(`Type${type}`);
        await expect
          .element(element.getByRole('region', { name: 'Dossier' }))
          .toHaveTextContent(dossier);
        await shootParts(element, `detail-${type}-ticket`);
      },
    );

    it('a campaign: description, members, comments, and its start', async () => {
      const element = await render(CAMPAIGN, 'Invoicing for the Q4 close', true);
      await expect.element(element.getByRole('heading', { name: 'Done when' })).toBeVisible();
      await expect
        .element(element.getByRole('region', { name: 'Members' }))
        .toHaveTextContent('Tax rates per country');
      await expect
        .element(element.getByRole('group', { name: 'Agent' }))
        .toHaveTextContent('Start campaign');
      await shootParts(element, 'detail-campaign');
    });
  });

  describe('actions, as the registry serves them', () => {
    it('a reported ticket: every group', async () => {
      const element = await render(EVERY_STATUS, 'Reported ticket');
      await agentButtons(element, ['Dispatch', 'Refine']);
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Mark refined Drop Block');
      await expect
        .element(element.getByRole('group', { name: 'Plan' }))
        .toHaveTextContent('Edit Reshape Refinement room');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-reported-ticket');
    });

    it('a verified ticket: its moves only', async () => {
      const element = await render(EVERY_STATUS, 'Verified ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Status Mark done Back to verifying Drop');
      expect(element.getByRole('group').elements()).toHaveLength(1);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-verified-ticket');
    });

    it('done work: nothing', async () => {
      const element = await render(EVERY_STATUS, 'Done epic');
      await expect.element(element.getByRole('heading', { level: 1 })).toHaveTextContent('Done');
      expect(element.getByRole('button').elements()).toHaveLength(0);
    });

    it('a refined feature: its own moves and the plan, nothing to dispatch', async () => {
      const element = await render('an epic with features and tasks', 'Open feature');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Mark implementing Skip to implemented Back to reported Drop');
      expect(element.getByRole('group', { name: 'Agent' }).elements()).toHaveLength(0);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-refined-feature');
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
        .toHaveTextContent('Mark verifying Skip to verified Back to implementing Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-implemented-ticket');

      // The next phase: one phase, PHASE.
      const id = (await goldenMaster(IMPLEMENTED, 'getEntity')).id;
      const dispatched = await press(element, 'Verify', `/projects/api/entities/${id}/dispatch`);
      expect(dispatched.request.body).toEqual({ mode: 'PHASE' });
      dispatched.flush(await goldenMaster(IMPLEMENTED, 'dispatchEntity'));
      await answered();

      const moved = await press(element, 'Mark verifying', `/projects/api/entities/${id}/status`);
      expect(moved.request.body).toEqual({ target: 'VERIFYING' });
      moved.flush(await goldenMaster(IMPLEMENTED, 'moveEntityStatus'));
      await answered();
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Mark verified Back to implemented Drop Block');
      await expect.element(element).toHaveTextContent('ticket · verifying');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-verifying-ticket');
    });

    it('an implementing epic: Dispatch lists the flow it runs', async () => {
      await commands.stubFigure(`${PROJECTS}/projects/api/epics/*/dossier-assets/*/content`);
      const element = await render(
        'an epic in detail',
        'Export invoices for the accountants',
        true,
      );
      await userEvent.hover(element.getByRole('button', { name: 'Dispatch' }));
      await expect
        .element(element.getByRole('tooltip'))
        .toHaveTextContent('Runsimplement → IMPLEMENTEDverify → VERIFIED');
      await expect.element(element).toMatchScreenshot('actions-implementing-epic-runs');
    });

    it('a refined epic: the implement phase, and the move to IMPLEMENTING', async () => {
      const element = await render(EVERY_STATUS, 'Refined epic');
      await agentButtons(element, ['Dispatch', 'Implement']);
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-refined-epic');
      const work = await goldenMaster(EVERY_STATUS, 'listProjectEntities');
      const id = work.entities.find((e: { title: string }) => e.title === 'Refined epic').id;
      const moved = await press(
        element,
        'Mark implementing',
        `/projects/api/entities/${id}/status`,
      );
      expect(moved.request.body).toEqual({ target: 'IMPLEMENTING' });
      // "a refined epic" records this move; its epic is another seed's, so only its status counts.
      moved.flush(await goldenMaster('a refined epic', 'moveEntityStatus'));
      await answered();
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Mark implemented Back to refined Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-implementing-epic');
    });

    it('a dropped ticket: Reopen, back to REPORTED', async () => {
      const element = await render(EVERY_STATUS, 'Dropped ticket');
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Status Reopen');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-dropped-ticket');
      const work = await goldenMaster(EVERY_STATUS, 'listProjectEntities');
      const id = work.entities.find((e: { title: string }) => e.title === 'Dropped ticket').id;
      const moved = await press(element, 'Reopen', `/projects/api/entities/${id}/status`);
      expect(moved.request.body).toEqual({ target: 'REPORTED' });
      moved.flush(await goldenMaster('a dropped ticket', 'moveEntityStatus'));
      await answered();
      await expect
        .element(element.getByRole('group', { name: 'Status' }))
        .toHaveTextContent('Mark refined Drop Block');
      await expect.element(actionsOf(element)).toMatchScreenshot('actions-reopened-ticket');
    });
  });
});
