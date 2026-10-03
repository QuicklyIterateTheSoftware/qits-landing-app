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
const CAMPAIGN = 'a campaign with work in every phase';
const EPIC = 'an epic with features and tasks';

/**
 * The work item page's actions and what they send, and the children it shows, on qits-projects'
 * golden masters: the project list and "a project with work in every status" (one epic and one
 * ticket per status), "a campaign with work in every phase" and "an epic with features and tasks". Which
 * actions show for which status is `work-actions.spec.ts`; this checks the page wires them.
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
   * The page of the entity titled `title` in `state`'s recorded work, with everything answered:
   * a campaign's read too, from the same state.
   */
  async function shown(title: string, state = WORK) {
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
      read.flush(goldenMaster(state, 'getCampaign'));
    }
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    /** Each link below the header: its text and where it leads. */
    const children = () =>
      [...element.querySelectorAll('section a')].map((a) => [
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
      { title: 'Agent', actions: ['Dispatch', 'Next phase'] },
      { title: 'Status', actions: ['Mark refined', 'Drop', 'Block'] },
      { title: 'Plan', actions: ['Edit', 'Reshape', 'Refine'] },
    ]);
  });

  it('shows a campaign with its description, its start and its members in campaign order', async () => {
    const { element, groups, children } = await shown('Card campaign', CAMPAIGN);
    expect(element.textContent).toContain('Seeded work.');
    // REFINED: the start, the moves; no plan for a campaign.
    expect(groups()).toEqual([
      { title: 'Agent', actions: ['Start campaign'] },
      { title: 'Status', actions: ['Drop', 'Block'] },
    ]);
    expect(element.querySelector('section h2')?.textContent?.trim()).toBe('Members');
    const titles = children()
      .map(([text]) => text)
      .filter((text) => !text?.startsWith('contract-'));
    expect(titles).toEqual(['Refined epic', 'Refined ticket', 'Reported ticket', 'Done ticket']);
    expect(children()).toContainEqual(['Reported ticket', 'contract-00000001-4']);
  });

  it('shows an epic’s features, each with its tasks', async () => {
    const { element, children } = await shown('Nested epic', EPIC);
    expect(element.querySelector('section h2')?.textContent?.trim()).toBe('Features');
    expect(children()).toEqual([
      ['First shipped task', 'contract-00000001-3'],
      ['Second shipped task', 'contract-00000001-4'],
      ['Shipped feature', 'contract-00000001-2'],
      ['Open task', 'contract-00000001-6'],
      ['Open feature', 'contract-00000001-5'],
    ]);
  });

  it('shows a feature’s tasks', async () => {
    const { element, children } = await shown('Shipped feature', EPIC);
    expect(element.querySelector('section h2')?.textContent?.trim()).toBe('Tasks');
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
    expect(element.querySelector('section')?.className).toContain('hidden');
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
    const request = http.expectOne(`/projects/api/tickets/${entity.id}/transition`);
    expect(request.request.body).toEqual({ target: 'REFINED' });
    // The recorded answer of "a verified ticket" (a move to DONE), with the status this move
    // answers instead.
    const answer = goldenMaster('a verified ticket', 'transitionTicket');
    request.flush({ ticket: { ...answer.ticket, status: 'REFINED' } });
    await settle();
    await harness.fixture.whenStable();
    expect(groups().map((g) => g.actions)).toEqual([
      ['Dispatch', 'Next phase'],
      ['Drop', 'Block'],
      ['Edit', 'Reshape'],
    ]);
  });

  it('drops an epic through the epic door', async () => {
    const { harness, entity, groups, press } = await shown('Implementing epic');
    press('Drop');
    await settle();
    const request = http.expectOne(`/projects/api/epics/${entity.id}/transition`);
    expect(request.request.body).toEqual({ target: 'DROPPED' });
    // The recorded answer of "a verified epic" (a move to DONE), with the status this move
    // answers instead.
    const answer = goldenMaster('a verified epic', 'transitionEpic');
    request.flush({ epic: { ...answer.epic, status: 'DROPPED' } });
    await settle();
    await harness.fixture.whenStable();
    expect(groups()).toEqual([]);
  });

  it('sends nothing for the actions not built yet', async () => {
    const { press } = await shown('Reported epic');
    for (const label of ['Dispatch', 'Next phase', 'Block', 'Edit', 'Reshape', 'Refine']) {
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
    await settle();
    await harness.fixture.whenStable();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.textContent).toContain('This project has no work item nothing-1.');
    expect(element.querySelectorAll('button')).toHaveLength(0);
  });
});
