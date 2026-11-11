import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of an agent's page inside the shell (`openRoute`), at the agent's bare URL (no tab
 * open). The project is qits-projects' recording ("a project exists");
 * the agent is qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug
 * ticket's agent, slot 1), the project's ACTIVE agents (the same read as the shell's agents menu)
 * the same agent as "an agent whose workspace
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

const ITEM = 'contract-00000001-9';
const AGENT = 'an agent with a saved prompt draft';
const STARTING = 'an agent whose workspace is starting';
const LEFTOVER = 'an agent with leftover work';
const NOW = new Date('2026-01-01T00:04:00Z');

describe('AgentLayout (screenshots)', () => {
  let http: HttpTestingController;
  let streams: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
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

  /** Opens the agent's page and answers the agent, the project's agents as `agents` names. */
  async function render(agents = STARTING) {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1140, 900);
    const agent = await goldenMaster(AGENT, 'getAgent', 'qits-workspaces');
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/agents/${agent.agentId}`,
      { agents },
    );
    return { opened, agent };
  }

  /** Answers the agent's read with `body`. */
  async function answerAgent(opened: OpenedRoute, agentId: string, body: object) {
    http.expectOne(`/workspaces/api/agents/${agentId}`).flush(body);
    await opened.settled();
  }

  /**
   * Answers the start running against the agent's slot, asked of the agent
   * (`getAgentActiveProcess`, epic qits-1667). qits-workspaces records it only with no start
   * running; a live start is recorded for the slot's own lookup (the same `{ technicalProcessId }`,
   * which the slot page's pact binds), so this is that answer.
   */
  async function answerStart(opened: OpenedRoute, agentId: string) {
    const process = await goldenMaster(STARTING, 'getWorkspaceActiveProcess', 'qits-workspaces');
    http.expectOne(`/workspaces/api/agents/${agentId}/active-process`).flush(process);
    await opened.settled();
    return process;
  }

  it('shows the agent, its item, its workspace and its slot coming up', async () => {
    const { opened, agent } = await render();
    const { project } = opened;
    await answerAgent(opened, agent.agentId, agent);
    const slot = agent.workspaceRowId;
    const process = await answerStart(opened, agent.agentId);
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('heading', { name: `Agent ${ITEM}` })).toBeVisible();
    await expect
      .element(view.getByRole('link', { name: ITEM }))
      .toHaveAttribute('href', `/projects/${project.slug}/work/detail/${ITEM}`);
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: `ws-${slot}` }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/${slot}`);
    await expect.element(view.getByRole('region', { name: 'Starting' })).toBeVisible();
    expect(streams).toEqual([
      `https://workspaces.test/workspaces/api/technical-processes/${process.technicalProcessId}/events`,
    ]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('starting', { kind: 'DATA' });
  });

  it('shows a refused discard in the service’s words, and offers force', async () => {
    const { opened, agent } = await render();
    await answerAgent(opened, agent.agentId, agent);
    await answerStart(opened, agent.agentId);
    const view = page.elementLocator(opened.page);
    await view.getByRole('button', { name: 'Discard', exact: true }).click();
    opened.harness.fixture.detectChanges();
    await view.getByRole('button', { name: 'Confirm discard?' }).click();
    await opened.settled();
    const refusal = await goldenMaster(LEFTOVER, 'discardAgent', 'qits-workspaces');
    const request = http.expectOne(`/workspaces/api/agents/${agent.agentId}/discard`);
    expect(request.request.body).toEqual({ force: false });
    request.flush(refusal, { status: 409, statusText: 'Conflict' });
    await opened.settled();
    await expect.element(view).toMatchTextContent(refusal.message);
    await expect.element(view.getByRole('button', { name: 'Discard anyway' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('discard-refused', { kind: 'ERROR' });
  });

  it('marks the agent as failed to load', async () => {
    const { opened, agent } = await render('unanswered');
    // An error answer is a status only: the read fails, and the page says so.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    // The layout's read of the project's agents and the shell's agents menu's: both fail.
    const active = `/workspaces/api/agents?projectId=${opened.project.id}&state=ACTIVE`;
    for (const read of http.match(active)) {
      read.flush(null, { status: 500, statusText: 'Server Error' });
    }
    await opened.settled();
    const view = page.elementLocator(opened.page);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('error', { kind: 'ERROR' });
  });
});
