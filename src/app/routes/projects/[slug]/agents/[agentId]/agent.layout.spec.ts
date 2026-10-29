import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../api/workspaces/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { SelectedProject } from '$core/projects/selected-project';
import {
  workspacesGoldenMaster,
  workspacesGoldenMasters,
} from '../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { AgentLayout } from './agent.layout';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const AGENT = 'an agent with a saved prompt draft';
const NO_AGENT = 'no agent with that id';
const SLUG = 'contract-00000001';
const PROJECT_ID = 'p-1';
const agentIdOf = (state: string) =>
  workspacesGoldenMasters.operation(state, 'getAgent').params['agentId'];
const AGENT_ID = agentIdOf(AGENT);

/**
 * `AgentLayout` on qits-workspaces' recorded `getAgent` (the bug ticket's agent, slot 1) and the
 * slot "an agent whose workspace is starting" records; the project's ACTIVE agents, which carry the
 * waits and attention no published state records yet, inline.
 */
describe('AgentLayout', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/agents/:agentId',
            component: AgentLayout,
            children: [{ path: '', children: [] }],
          },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins(),
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

  async function open(agentId: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/projects/${SLUG}/agents/${agentId}`);
    await settle();
    return harness;
  }

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  const listed = {
    agents: [
      {
        agentId: AGENT_ID,
        entityId: 'contract-00000001-10',
        state: 'ACTIVE',
        waits: [
          {
            id: 'w-1',
            label: 'contract-00000001-12 to be VERIFIED',
            subjectKind: 'WORK_ITEM',
            subjectQualifiedId: 'contract-00000001-12',
            subjectState: 'IMPLEMENTING',
          },
        ],
        attention: { code: 'IDLE_NO_WAIT', reason: 'Idle with no wait declared' },
      },
    ],
  };

  it('shows the agent’s item, its waits and attention, and its workspace as a field', async () => {
    const harness = await open(AGENT_ID);
    http
      .expectOne(`/workspaces/api/agents/${AGENT_ID}`)
      .flush(workspacesGoldenMaster(AGENT, 'getAgent'));
    http.expectOne(`/workspaces/api/agents?projectId=${PROJECT_ID}&state=ACTIVE`).flush(listed);
    await answered(harness);
    // The agent page asks nothing of the slot: only the agent's start, which no start runs.
    http
      .expectOne(`/workspaces/api/agents/${AGENT_ID}/active-process`)
      .flush(workspacesGoldenMaster('a workspace slot hosting agents', 'getAgentActiveProcess'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    const link = (name: string) =>
      [...element.querySelectorAll('a')].find((a) => a.textContent?.trim() === name);
    expect(element.querySelector('h1')?.textContent).toContain('Agent contract-00000001-10');
    expect(link('contract-00000001-10')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/work/detail/contract-00000001-10`,
    );
    expect(element.textContent).toContain('Invoice totals are off by one cent');
    expect(element.querySelector('[data-wait]')?.textContent).toContain('contract-00000001-12');
    expect(element.querySelector('[data-attention]')?.textContent).toContain(
      'Idle with no wait declared',
    );
    expect(link('Prompt agent')?.getAttribute('href')).toBe(
      `/projects/${SLUG}/agents/${AGENT_ID}/chat`,
    );
    const workspace = element.querySelector('#agent-workspace');
    expect(workspace?.textContent?.trim()).toBe('Workspace');
    expect(link('ws-1')?.getAttribute('href')).toBe(`/projects/${SLUG}/workspaces/1`);
    // The agent's own verbs, for a RUNNING agent; the container's are the workspace page's.
    expect(
      [...element.querySelectorAll('[role=group][aria-label=Agent] button')].map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual(['Interrupt', 'Stop', 'Restart']);
    expect(element.querySelector('[role=group][aria-label=Container]')).toBeNull();
    expect(
      [...element.querySelectorAll('nav[aria-label=Agent] a')].map((a) => a.getAttribute('href')),
    ).toEqual(
      ['chat', 'files', 'terminal'].map((tab) => `/projects/${SLUG}/agents/${AGENT_ID}/${tab}`),
    );
  });

  it('says the service does not know an agent', async () => {
    const id = agentIdOf(NO_AGENT);
    const harness = await open(id);
    http
      .expectOne(`/workspaces/api/agents/${id}`)
      .flush(workspacesGoldenMaster(NO_AGENT, 'getAgent'), {
        status: 404,
        statusText: 'Not Found',
      });
    http
      .expectOne(`/workspaces/api/agents?projectId=${PROJECT_ID}&state=ACTIVE`)
      .flush({ agents: [] });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    const missing = [...element.querySelectorAll('p')].find((p) =>
      p.textContent?.includes(`No agent ${id}`),
    );
    expect(missing?.classList.contains('hidden')).toBe(false);
    expect(element.querySelector('nav[aria-label=Agent]')).toBeNull();
  });
});
