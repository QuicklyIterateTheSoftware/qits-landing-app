import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, Subject } from 'rxjs';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { DomainEvents, type DomainEvent } from '$core/events/domain-events';
import { WORKSPACE_REFRESH_DEBOUNCE_MS } from '$core/workspaces/workspace-events';
import { SelectedProject } from '$core/projects/selected-project';
import { goldenMaster, workspacesGoldenMaster } from '../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../testing/platform-origins';
import { ProjectAgentsPage } from './project-agents.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const SLOTS = 'a project with workspace slots hosting agents';
const REPOSITORIES = 'a project with repositories in components';
const SLUG = 'contract-00000001';
const PROJECT_ID = 'p-1';

/**
 * `ProjectAgentsPage`: the project's ACTIVE agents (inline, with the waits and attention no
 * published state records yet), then its wrapper's slots under "Workspaces" (qits-projects' and
 * qits-workspaces' recordings), with the Targets link and the data marks (qits-2141); and its
 * `qitsResource`s read again after the domain events about them (qits-1270, qits-2143).
 */
describe('ProjectAgentsPage', () => {
  let http: HttpTestingController;
  /** The app's one stream, as the page's resources read it (`QITS_DOMAIN_EVENTS`). */
  let events: Subject<DomainEvent>;

  beforeEach(() => {
    events = new Subject<DomainEvent>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'projects/:slug/agents', component: ProjectAgentsPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins({}, { system: 'https://system.qits.example' }),
        {
          provide: SelectedProject,
          useValue: { slug: signal(SLUG), project: signal({ id: PROJECT_ID }) },
        },
        // The app's one stream, faked; the page's resources read it as `app.config.ts` provides it.
        {
          provide: DomainEvents,
          useValue: {
            on: (names: readonly string[]) =>
              events.pipe(filter((event) => names.includes(event.name ?? ''))),
          },
        },
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The project list, which the stores behind the status lines' context read; not this page's.
    http.match('/projects/api/projects');
    http.verify();
  });

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  it('lists the agents first, with their waits and attention, then the workspaces', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${SLUG}/agents`);
    await settle();
    http.expectOne(`/workspaces/api/agents?projectId=${PROJECT_ID}&state=ACTIVE`).flush({
      agents: [
        {
          agentId: 'a-1',
          entityId: `${SLUG}-10`,
          entityTitle: 'Invoice totals are off by one cent',
          state: 'ACTIVE',
          runState: 'RUNNING',
          activity: 'WAITING',
          waits: [
            {
              id: 'w-1',
              label: 'the run to end',
              subjectKind: 'CI_RUN',
              subjectId: 'run-1234567890',
              subjectState: 'RUNNING',
            },
          ],
          attention: { code: 'WAIT_OVERDUE', reason: 'The wait is overdue', waitId: 'w-1' },
        },
      ],
    });
    const repositories = goldenMaster(REPOSITORIES, 'listProjectRepositories');
    http.expectOne(`/projects/api/projects/${PROJECT_ID}/repositories`).flush(repositories);
    await answered(harness);
    const wrapper = repositories.wrapper.repositoryId as string;
    http
      .expectOne(`/workspaces/api/workspaces?repositoryId=${wrapper}`)
      .flush(workspacesGoldenMaster(SLOTS, 'listWorkspaces'));
    http.expectOne('/workspaces/api/agents').flush(workspacesGoldenMaster(SLOTS, 'listAgents'));
    await answered(harness);

    const element = harness.routeNativeElement as HTMLElement;
    const headings = [...element.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Active agents', 'Workspaces']);
    const link = (name: string) =>
      [...element.querySelectorAll('a')].find((a) => a.textContent?.trim() === name);
    expect(link(`${SLUG}-10`)?.getAttribute('href')).toBe(`/projects/${SLUG}/agents/a-1`);
    expect(element.querySelector('[data-wait]')?.textContent).toContain('CI run run-1234');
    expect(element.querySelector('[data-attention]')?.textContent).toContain('The wait is overdue');
    expect(link('Targets')?.getAttribute('href')).toBe(
      'https://system.qits.example/system/targets',
    );
    const slot = [...element.querySelectorAll('a')].find((a) =>
      a.getAttribute('href')?.startsWith(`/projects/${SLUG}/workspaces/`),
    );
    expect(slot?.textContent).toContain('agents');

    // The data marks (qits-2141): each list names its read, each row its record.
    const sources = [...element.querySelectorAll('[data-qits-source]')].map((e) =>
      e.getAttribute('data-qits-source'),
    );
    expect(sources).toEqual([
      'qits-workspaces-service#listAgents',
      'qits-workspaces-service#listWorkspaces',
    ]);
    expect(element.querySelector('li[data-qits-item="agentId=a-1"]')).not.toBeNull();
    expect(slot?.closest('li')?.getAttribute('data-qits-item')).toMatch(/^id=\d+$/);
    expect(slot?.querySelector('[data-qits-field="workspaceId"]')?.textContent).toContain('ws-');
  });

  it('reads the active agents again after a status event about the project, not another’s', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${SLUG}/agents`);
    await settle();
    const active = `/workspaces/api/agents?projectId=${PROJECT_ID}&state=ACTIVE`;
    http.expectOne(active).flush({ agents: [] });
    http
      .expectOne(`/projects/api/projects/${PROJECT_ID}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);

    const status = (projectId: string): DomainEvent => ({
      name: 'AgentWaitOpened',
      payload: JSON.stringify({ projectId, agentId: 'a-9' }),
    });
    events.next(status('another-project'));
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_REFRESH_DEBOUNCE_MS + 100));
    await answered(harness);
    http.expectNone(active);

    events.next(status(PROJECT_ID));
    events.next(status(PROJECT_ID));
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_REFRESH_DEBOUNCE_MS + 100));
    await answered(harness);
    http.expectOne(active).flush({ agents: [] });
  });

  it('says when the project has no active agents', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${SLUG}/agents`);
    await settle();
    http
      .expectOne(`/workspaces/api/agents?projectId=${PROJECT_ID}&state=ACTIVE`)
      .flush({ agents: [] });
    http
      .expectOne(`/projects/api/projects/${PROJECT_ID}/repositories`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    const none = [...element.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('No active agents.'),
    );
    expect(none?.classList.contains('hidden')).toBe(false);
  });
});
