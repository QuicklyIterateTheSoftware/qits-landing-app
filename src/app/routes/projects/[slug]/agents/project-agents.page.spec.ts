import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as projectsClient } from '../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
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
 * qits-workspaces' recordings), with the Targets link.
 */
describe('ProjectAgentsPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
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
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
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
