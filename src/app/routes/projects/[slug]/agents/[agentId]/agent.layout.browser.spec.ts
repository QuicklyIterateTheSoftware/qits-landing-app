import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { AgentLayout } from './agent.layout';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of an agent's page. The project is qits-projects' recording ("a project exists");
 * the agent is qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug
 * ticket's agent, slot 1), the project's ACTIVE agents the same agent as "an agent whose workspace
 * is starting" lists it (no waits or attention: this agent is not among "a project with agents
 * needing attention"'s, which records a different fixture agent for the same ticket), and its slot
 * that state's: a container coming up while a start is live. The start's log stream opens but sends
 * nothing here: the log's segments are `ui-segment-log`'s own screenshots.
 *
 * Its Discard is refused as qits-workspaces' "an agent with leftover work" refuses it (409
 * `AGENT_HAS_LEFTOVER_WORK`, the same agent), and the page offers to discard it anyway.
 *
 * The clock is pinned four minutes after the recordings' instants. The event stream never connects.
 */

const ITEM = 'contract-00000001-10';
const AGENT = 'an agent with a saved prompt draft';
const STARTING = 'an agent whose workspace is starting';
const LEFTOVER = 'an agent with leftover work';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentLayout (screenshots)', () => {
  let http: HttpTestingController;
  let streams: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    streams = [];
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
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: EVENT_SOURCE,
          useValue: (url: string) => {
            streams.push(url);
            return { onmessage: null, onerror: null, readyState: 0, close: () => {} };
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
    vi.useRealTimers();
    await page.viewport(800, 600);
  });

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  /** Opens the agent's page and answers the project, the agent and the project's agents. */
  async function render() {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const agent = await goldenMaster(AGENT, 'getAgent', 'qits-workspaces');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/agents/${agent.agentId}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    http
      .expectOne(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)
      .flush(await goldenMaster(STARTING, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project, agent };
  }

  /** Answers the agent's slot, coming up, and the start running against it. */
  async function answerSlot(harness: RouterTestingHarness, slot: number) {
    http
      .expectOne(`/workspaces/api/workspaces/${slot}`)
      .flush(await goldenMaster(STARTING, 'getWorkspace', 'qits-workspaces'));
    const process = await goldenMaster(STARTING, 'getWorkspaceActiveProcess', 'qits-workspaces');
    http.expectOne(`/workspaces/api/workspaces/${slot}/active-process`).flush(process);
    await answered(harness);
    return process;
  }

  it('shows the agent, its item, its workspace and its slot coming up', async () => {
    const { harness, element, project, agent } = await render();
    const slot = agent.workspaceRowId;
    const process = await answerSlot(harness, slot);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('heading', { name: `Agent ${ITEM}` })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: ITEM }))
      .toHaveAttribute('href', `/projects/${project.slug}/work/detail/${ITEM}`);
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: `ws-${slot}` }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/${slot}`);
    await expect.element(view).toMatchTextContent('provisioning');
    await expect.element(view.getByRole('region', { name: 'Starting' })).toBeVisible();
    expect(streams).toEqual([
      `https://workspaces.test/workspaces/api/technical-processes/${process.technicalProcessId}/events`,
    ]);
    await expect.element(view).toMatchScreenshot('starting');
  });

  it('shows a refused discard in the service’s words, and offers force', async () => {
    const { harness, element, agent } = await render();
    await answerSlot(harness, agent.workspaceRowId);
    const view = page.elementLocator(element);
    await view.getByRole('button', { name: 'Discard', exact: true }).click();
    harness.fixture.detectChanges();
    await view.getByRole('button', { name: 'Confirm discard?' }).click();
    await settle();
    const refusal = await goldenMaster(LEFTOVER, 'discardAgent', 'qits-workspaces');
    const request = http.expectOne(`/workspaces/api/agents/${agent.agentId}/discard`);
    expect(request.request.body).toEqual({ force: false });
    request.flush(refusal, { status: 409, statusText: 'Conflict' });
    await answered(harness);
    await expect.element(view).toMatchTextContent(refusal.message);
    await expect.element(view.getByRole('button', { name: 'Discard anyway' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('discard-refused');
  });

  it('marks the agent as failed to load', async () => {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const agent = await goldenMaster(AGENT, 'getAgent', 'qits-workspaces');
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/agents/${agent.agentId}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    // An error answer is a status only: the read fails, and the page says so.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    http
      .expectOne(`/workspaces/api/agents?projectId=${project.id}&state=ACTIVE`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
