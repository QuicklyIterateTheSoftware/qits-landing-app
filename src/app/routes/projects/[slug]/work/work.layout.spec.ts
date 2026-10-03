import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { WORK_REFRESH_DEBOUNCE_MS } from '$core/work/selected-work';
import { goldenMaster } from '../../../../../testing/golden-masters';
import { WorkLayout } from './work.layout';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

@Component({ selector: 'app-test-page', template: `<p>Page content</p>` })
class TestPage {}

/**
 * The work section's tabs on qits-projects' golden masters: the project list, and "a project with
 * work in every status" (one epic and one ticket per status) or "a project with no work".
 */
describe('WorkLayout', () => {
  let http: HttpTestingController;
  let events: Subject<DomainEvent>;
  const list = goldenMaster('a project exists', 'listProjects');
  const project = list.entries[0].project;
  const entities = `/projects/api/projects/${project.id}/entities`;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work',
            component: WorkLayout,
            children: ['campaigns', 'refinement', 'in-progress', 'acceptance', 'archive'].map(
              (path) => ({
                path,
                component: TestPage,
              }),
            ),
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
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
      http.expectOne(entities).flush(goldenMaster(state, 'listProjectEntities'));
      await settle();
      await harness.fixture.whenStable();
    };
    return { harness, links, counts, answered };
  }

  it('links Campaigns, then the four phases in workflow order, and marks the current one', async () => {
    const { links, answered } = await shown('acceptance');
    await answered('a project with no work');
    expect(links().map((a) => [a.firstChild?.textContent?.trim(), a.getAttribute('href')])).toEqual(
      [
        ['Campaigns', `/projects/${project.slug}/work/campaigns`],
        ['Refinement', `/projects/${project.slug}/work/refinement`],
        ['In Progress', `/projects/${project.slug}/work/in-progress`],
        ['Acceptance', `/projects/${project.slug}/work/acceptance`],
        ['Archive', `/projects/${project.slug}/work/archive`],
      ],
    );
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'page',
      null,
    ]);
  });

  it('counts the epics and tickets on each page once the work is loaded', async () => {
    const { counts, answered } = await shown('in-progress');
    expect(counts()).toEqual([undefined, undefined, undefined, undefined, undefined]);
    await answered('a project with work in every status');
    // In Progress: an epic and a ticket per board status, and the started epic; not its feature.
    expect(counts()).toEqual([0, 2, 9, 2, 4]);
  });

  it('counts the campaigns, which no phase counts', async () => {
    const { counts, answered, harness } = await shown('campaigns');
    await answered('an epic in two campaigns');
    for (const request of http.match((r) => r.url.startsWith('/projects/api/campaigns/'))) {
      const id = request.request.url.split('/').pop();
      const answer = ['an epic in two campaigns', 'the second campaign of an epic in two campaigns']
        .map((state) => goldenMaster(state, 'getCampaign'))
        .find((body) => body.campaign.id === id);
      request.flush(answer);
    }
    await settle();
    await harness.fixture.whenStable();
    // Two campaigns; their one member, a REFINED epic, is on the board.
    expect(counts()).toEqual([2, 0, 1, 0, 0]);
  });

  it('counts a dropped campaign in the Archive, not in Campaigns', async () => {
    const { counts, harness } = await shown('archive');
    // "a campaign with work in every phase", with its campaign DROPPED: no recorded state holds a
    // campaign in a final state yet.
    const work = goldenMaster('a campaign with work in every phase', 'listProjectEntities');
    http.expectOne(entities).flush({
      ...work,
      entities: work.entities.map((e: { archetype: string }) =>
        e.archetype === 'CAMPAIGN' ? { ...e, status: 'DROPPED' } : e,
      ),
    });
    await settle();
    http
      .expectOne((r) => r.url.startsWith('/projects/api/campaigns/'))
      .flush(goldenMaster('a campaign with work in every phase', 'getCampaign'));
    await settle();
    await harness.fixture.whenStable();
    // Archive: the done ticket and the dropped campaign.
    expect(counts()).toEqual([0, 1, 3, 0, 2]);
  });

  it('asks for the work once while moving between the pages', async () => {
    const { harness, links, answered } = await shown('refinement');
    await answered('a project with work in every status');
    await harness.navigateByUrl(`/projects/${project.slug}/work/archive`);
    await settle();
    http.expectNone(entities);
    expect(links()[4].getAttribute('aria-current')).toBe('page');
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
    expect(counts()).toEqual([0, 0, 0, 0, 0]);
  });
});
