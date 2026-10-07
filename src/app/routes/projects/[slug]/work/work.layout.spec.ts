import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { WORK_REFRESH_DEBOUNCE_MS } from '$core/work/selected-work';
import { goldenMaster, workspacesGoldenMaster } from '../../../../../testing/golden-masters';
import { answerCampaignReads, campaignsIn } from '../../../../../testing/campaign-reads';
import { WorkLayout } from './work.layout';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

/** The open workspaces' read (`WorkspacesStore.load()`), and the state it is answered from. */
const OPEN_WORKSPACES = '/workspaces/api/work/workspaces';
const BOUND = 'a project with workspaces bound to work items';

/**
 * The work section's tabs on qits-projects' golden masters: the project list, and "a project with
 * work in every status" (one epic and one ticket per status) or "a project with no work". The open
 * workspaces come from qits-workspaces' "a project with workspaces bound to work items".
 */
describe('WorkLayout', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const entities = `/projects/api/projects/${project.id}/work`;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work',
            component: WorkLayout,
            children: [
              'campaigns',
              'refinement',
              'schedule',
              'in-progress',
              'acceptance',
              'archive',
            ].map((path) => ({
              path,
              component: TestPage,
            })),
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        { provide: DomainEvents, useValue: { on: () => events.asObservable() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The section at `tab`, with the project list answered and the work requested. */
  async function shown(tab: string) {
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/${tab}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    http.expectOne(OPEN_WORKSPACES).flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
    TestBed.tick();
    await settle();
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    const links = () => [...element.querySelectorAll<HTMLAnchorElement>('nav[aria-label=Work] a')];
    const counts = () =>
      links().map((a) => {
        const count = a.querySelector('span')!;
        return count.classList.contains('hidden') ? undefined : Number(count.textContent);
      });
    const answered = async (state: string) => {
      http.expectOne(entities).flush(goldenMaster(state, 'listProjectWork'));
      await settle();
      await harness.fixture.whenStable();
    };
    return { harness, links, counts, answered };
  }

  it('links Campaigns, then the five phases in workflow order, and marks the current one', async () => {
    const { links, answered } = await shown('acceptance');
    await answered('a project with no work');
    expect(links().map((a) => [a.firstChild?.textContent?.trim(), a.getAttribute('href')])).toEqual(
      [
        ['Campaigns', `/projects/${project.slug}/work/campaigns`],
        ['Refinement', `/projects/${project.slug}/work/refinement`],
        ['Schedule', `/projects/${project.slug}/work/schedule`],
        ['In Progress', `/projects/${project.slug}/work/in-progress`],
        ['Acceptance', `/projects/${project.slug}/work/acceptance`],
        ['Archive', `/projects/${project.slug}/work/archive`],
      ],
    );
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      null,
      'page',
      null,
    ]);
  });

  it('counts the epics and tickets on each page once the work is loaded', async () => {
    const { counts, answered } = await shown('in-progress');
    expect(counts()).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    await answered('a project with work in every status');
    // Schedule: the REFINED and the READY_FOR_DEV epic and ticket. In Progress: an epic and a
    // ticket per board status (READY_FOR_DEV first), and the started epic; not its feature.
    expect(counts()).toEqual([0, 2, 4, 9, 2, 4]);
  });

  it('counts the campaigns, which no phase counts', async () => {
    const { counts, answered, harness } = await shown('campaigns');
    await answered('an epic in two campaigns');
    // Each campaign's members from the state recording it (the second is a state of its own).
    await answerCampaignReads(
      http,
      goldenMaster,
      campaignsIn(goldenMaster('an epic in two campaigns', 'listProjectWork')),
      {
        members: {
          'contract-00000001-1': 'an epic in two campaigns',
          'contract-00000001-2': 'the second campaign of an epic in two campaigns',
        },
        described: ['an epic in two campaigns', 'the second campaign of an epic in two campaigns'],
      },
    );
    await settle();
    await harness.fixture.whenStable();
    // Two campaigns; their one member, a REFINED epic, waits on the Schedule tab.
    expect(counts()).toEqual([2, 0, 1, 0, 0, 0]);
  });

  it('counts a dropped campaign in the Archive, not in Campaigns', async () => {
    const { counts, harness } = await shown('archive');
    // "a campaign with work in every phase", with its campaign DROPPED: no recorded state holds a
    // campaign in a final state yet.
    const work = goldenMaster('a campaign with work in every phase', 'listProjectWork');
    http.expectOne(entities).flush({
      ...work,
      entities: work.entities.map((e: { archetype: string }) =>
        e.archetype === 'CAMPAIGN' ? { ...e, status: 'DROPPED' } : e,
      ),
    });
    await settle();
    await answerCampaignReads(http, goldenMaster, campaignsIn(work), {
      members: 'a campaign with work in every phase',
      described: ['a campaign with work in every phase'],
    });
    await settle();
    await harness.fixture.whenStable();
    // Schedule: the refined epic and tickets. Archive: the done ticket and the dropped campaign.
    expect(counts()).toEqual([0, 1, 3, 0, 0, 2]);
  });

  it('asks for the work once while moving between the pages', async () => {
    const { harness, links, answered } = await shown('refinement');
    await answered('a project with work in every status');
    await harness.navigateByUrl(`/projects/${project.slug}/work/archive`);
    await settle();
    http.expectNone(entities);
    http.expectNone(OPEN_WORKSPACES);
    expect(links()[5].getAttribute('aria-current')).toBe('page');
  });

  it('fetches the work again after a transition, and the counts follow', async () => {
    const { counts, answered } = await shown('in-progress');
    await answered('a project with work in every status');
    vi.useFakeTimers();
    events.next({ id: '1', name: 'EntityTransitioned', payload: '{}' });
    vi.advanceTimersByTime(WORK_REFRESH_DEBOUNCE_MS);
    vi.useRealTimers();
    await settle();
    await answered('a project with no work');
    expect(counts()).toEqual([0, 0, 0, 0, 0, 0]);
    // The open workspaces follow too: a dispatch opens one, an integration closes it.
    http.expectOne(OPEN_WORKSPACES).flush(workspacesGoldenMaster(BOUND, 'listOpenWorkspaces'));
  });
});
