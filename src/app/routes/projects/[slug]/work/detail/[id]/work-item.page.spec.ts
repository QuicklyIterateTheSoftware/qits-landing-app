import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { goldenMaster } from '../../../../../../../testing/golden-masters';
import { WorkItemPage } from './work-item.page';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const WORK = 'a project with work in every status';
const EPIC = 'an epic with features and tasks';
const REGISTRY = '/projects/api/entities/archetypes';
const DETAIL = 'a campaign in detail';
/** The links in the region of an item's children: features, tasks or members. */
const CHILDREN = ['Features', 'Tasks', 'Members'].map((n) => `section[aria-label=${n}] a`).join();

/**
 * The work item page's actions and what they send, and the children it shows, on qits-projects'
 * golden masters: the project list and "a project with work in every status" (one epic and one
 * ticket per status), "an epic with features and tasks" and "a campaign in detail" (with the
 * campaign's own reads), and the archetype registry. Which actions show for which status is `work-actions.spec.ts`; this
 * checks the page wires them.
 */
describe('WorkItemPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/work/detail/:id', component: WorkItemPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
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
   * Answers the item's own reads (`WorkDetailStore`): from `state`'s recordings when it is a detail
   * state, else with 404 (an error answer is a status only), which leaves the page's body without
   * its description, dossier and comments but with its children.
   */
  async function answerDetail(state: string, ref: string, recorded: boolean) {
    const item = http.expectOne(`/projects/api/entities/${ref}`);
    const thread = http.expectOne(`/projects/api/entities/${ref}/comments`);
    if (!recorded) {
      item.flush(null, { status: 404, statusText: 'Not Found' });
      thread.flush(null, { status: 404, statusText: 'Not Found' });
      return;
    }
    const entity = goldenMaster(state, 'getEntity');
    item.flush(entity);
    thread.flush(goldenMaster(state, 'listEntityComments'));
    await settle();
    if (entity.archetype === 'EPIC') {
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier`)
        .flush(goldenMaster(state, 'listEpicDossierPages'));
      http
        .expectOne(`/projects/api/epics/${entity.id}/dossier-assets`)
        .flush(goldenMaster(state, 'listEpicDossierAssets'));
    }
    if (entity.archetype === 'TICKET') {
      http
        .expectOne(`/projects/api/tickets/${entity.id}/dossier`)
        .flush(goldenMaster(state, 'listTicketDossierPages'));
    }
  }

  /**
   * The page of the entity titled `title` in `state`'s recorded work, with everything answered:
   * a campaign's read too, from `campaignState`, and the item's own reads (`answerDetail`).
   */
  async function shown(title: string, state = WORK, detail = false, campaignState = state) {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const work = goldenMaster(state, 'listProjectEntities');
    const entity = work.entities.find((e: { title: string }) => e.title === title);
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(
      `/projects/${project.slug}/work/detail/${entity.qualifiedId}`,
    );
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http.expectOne(`/projects/api/projects/${project.id}/entities`).flush(work);
    await settle();
    await settle();
    for (const read of http.match((r) => r.url.startsWith('/projects/api/campaigns/'))) {
      read.flush(goldenMaster(campaignState, 'getCampaign'));
    }
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listArchetypes'));
    await answerDetail(state, entity.qualifiedId, detail);
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    /** Each link in the children's region: its text and where it leads. */
    const children = () =>
      [...element.querySelectorAll(CHILDREN)].map((a) => [
        a.textContent?.trim(),
        a.getAttribute('href')?.split('/').pop(),
      ]);
    const groups = () =>
      [...element.querySelectorAll('[role=group]')].map((g) => ({
        title: g.getAttribute('aria-label'),
        actions: [...g.querySelectorAll('button')].map((b) => b.textContent?.trim()),
      }));
    const press = (label: string) =>
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
    return { harness, element, entity, groups, press, children };
  }

  it('shows the title and every group for a reported ticket', async () => {
    const { element, groups } = await shown('Reported ticket');
    expect(element.querySelector('h1')?.textContent).toContain('Reported ticket');
    expect(groups()).toEqual([
      { title: 'Agent', actions: ['Dispatch', 'Refine'] },
      { title: 'Status', actions: ['Mark refined', 'Drop', 'Block'] },
      { title: 'Plan', actions: ['Edit', 'Reshape', 'Refinement room'] },
    ]);
  });

  it('shows a campaign with its description, its start and its members in campaign order', async () => {
    const { element, groups, children } = await shown('Invoicing for the Q4 close', DETAIL, true);
    expect(element.textContent).toContain('Everything accounting needs');
    // REFINED: the start, the served moves; no plan for a campaign.
    expect(groups()).toEqual([
      { title: 'Agent', actions: ['Start campaign'] },
      { title: 'Status', actions: ['Mark implemented', 'Back to reported', 'Drop', 'Block'] },
    ]);
    const titles = children()
      .map(([text]) => text)
      .filter((text) => !text?.startsWith('contract-'));
    // Each member with its subtree: the export epic's features and their tasks.
    expect(titles).toEqual([
      'Tax rates per country',
      'Export invoices for the accountants',
      'Stream invoices as CSV',
      'Download button on the invoice list',
      'CSV export',
      'Render one invoice as PDF',
      'Preview the PDF before download',
      'PDF export',
      'Invoice totals are off by one cent',
      'Credit notes show the wrong sign',
      'Remember the last export format',
    ]);
    expect(children()).toContainEqual(['Remember the last export format', 'contract-00000001-11']);
  });

  it('shows an epic’s features, each with its tasks', async () => {
    const { children } = await shown('Nested epic', EPIC);
    expect(children()).toEqual([
      ['First shipped task', 'contract-00000001-3'],
      ['Second shipped task', 'contract-00000001-4'],
      ['Shipped feature', 'contract-00000001-2'],
      ['Open task', 'contract-00000001-6'],
      ['Open feature', 'contract-00000001-5'],
    ]);
  });

  it('shows a feature’s tasks', async () => {
    const { children } = await shown('Shipped feature', EPIC);
    expect(children()).toEqual([
      ['First shipped task', 'contract-00000001-3'],
      ['Second shipped task', 'contract-00000001-4'],
      ['Shipped feature', 'contract-00000001-2'],
    ]);
  });

  it.each([
    ['ticket', 'Reported ticket', WORK],
    ['task', 'Open task', EPIC],
  ])('shows no children for a %s', async (_, title, state) => {
    const { element, children } = await shown(title, state);
    expect(element.querySelector(CHILDREN.replaceAll(' a', ''))).toBeNull();
    expect(children()).toEqual([]);
  });

  it('shows no actions for done work', async () => {
    const { groups } = await shown('Done epic');
    expect(groups()).toEqual([]);
  });

  it('marks a reported ticket refined, and its actions follow the new status', async () => {
    const { harness, entity, groups, press } = await shown('Reported ticket');
    press('Mark refined');
    await settle();
    const request = http.expectOne(`/projects/api/entities/${entity.id}/status`);
    expect(request.request.body).toEqual({ target: 'REFINED' });
    request.flush(goldenMaster('a reported ticket', 'moveEntityStatus'));
    await settle();
    await harness.fixture.whenStable();
    expect(groups().map((g) => g.actions)).toEqual([
      ['Dispatch', 'Implement'],
      ['Mark implementing', 'Skip to implemented', 'Back to reported', 'Drop', 'Block'],
      ['Edit', 'Reshape'],
    ]);
  });

  it('drops an epic through the status door, and offers to reopen it', async () => {
    const { harness, entity, groups, press } = await shown('Implementing epic');
    press('Drop');
    await settle();
    const request = http.expectOne(`/projects/api/entities/${entity.id}/status`);
    expect(request.request.body).toEqual({ target: 'DROPPED' });
    // The recorded answer of "an implementing epic" (a move to IMPLEMENTED), with the status this
    // move answers instead.
    const answer = goldenMaster('an implementing epic', 'moveEntityStatus');
    request.flush({ ...answer, status: 'DROPPED' });
    await settle();
    await harness.fixture.whenStable();
    expect(groups()).toEqual([{ title: 'Status', actions: ['Reopen'] }]);
  });

  it.each([
    ['Dispatch', 'FLOW', 'a refined epic'],
    ['Implement', 'PHASE', 'a reported epic'],
  ])('presses %s: a dispatch with mode %s', async (label, mode, recorded) => {
    const { entity, press } = await shown('Refined epic');
    press(label);
    await settle();
    const request = http.expectOne(`/projects/api/entities/${entity.id}/dispatch`);
    expect(request.request.body).toEqual({ mode });
    request.flush(goldenMaster(recorded, 'dispatchEntity'));
    await settle();
  });

  it('sends nothing for the actions not built yet', async () => {
    const { press } = await shown('Reported epic');
    for (const label of ['Block', 'Edit', 'Reshape', 'Refinement room']) {
      press(label);
    }
    await settle();
    http.expectNone(() => true);
  });

  it('says so when the project has no such work item', async () => {
    const list = goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/detail/nothing-1`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    http
      .expectOne(`/projects/api/projects/${project.id}/entities`)
      .flush(goldenMaster(WORK, 'listProjectEntities'));
    http.expectOne(REGISTRY).flush(goldenMaster('the archetype registry', 'listArchetypes'));
    await answerDetail(WORK, 'nothing-1', false);
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.textContent).toContain('This project has no work item nothing-1.');
    expect(element.querySelectorAll('button')).toHaveLength(0);
  });
});
