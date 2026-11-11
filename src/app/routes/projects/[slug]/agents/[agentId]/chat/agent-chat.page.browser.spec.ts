import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { PickedContext } from '$core/workspaces/picked-context';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../../testing/browser/app-route';

/**
 * Screenshots of an agent's Chat tab, at `agents/<agent id>/chat`, inside the shell and the agent's
 * layout (`openRoute`). The project is qits-projects' "a project exists"; the agent is
 * qits-workspaces' `getAgent` of "an agent with a saved prompt draft" (the bug ticket's agent
 * `…a1`, slot 1), the project's ACTIVE agents (the layout's read, and the shell's agents menu's)
 * "an agent whose workspace is starting"'s and its start "a workspace slot hosting agents"' (the
 * agent RUNNING in slot 1, no start). Its saved prompt draft is qits-workspaces' "an agent with a
 * saved prompt draft" (the same agent).
 *
 * Its transcript, read through the agent proxy (epic qits-1667), is qits-workspace-daemon's "a
 * workspace daemon with an agent that has taken turns" (the same agent's command). The tab opens no
 * socket. The event streams never connect.
 *
 * A picked reference's ↗ is a declared exit (`open-picked-reference` `files`, epic qits-2000),
 * shown by `picked-reference` and followed once. A pick is the browser's own state
 * (`PickedContext`, what the Files tab leaves behind), made here after the draft restored: lines 3-4
 * of the daemon's recorded source file ("a workspace daemon with an agent whose worktree holds
 * files"' `readFile`, as the Files tab reads it). The Files tab it leaves for is its own spec's:
 * its reads are answered with an error (`leftFor`).
 */

const SLOT = 'a workspace slot hosting agents';
const STARTING = 'an agent whose workspace is starting';
const DRAFTED = 'an agent with a saved prompt draft';
const TURNS = 'a workspace daemon with an agent that has taken turns';
const FILES = 'a workspace daemon with an agent whose worktree holds files';
const NOW = new Date('2026-01-01T00:04:00Z');

describe('AgentChatPage (screenshots)', () => {
  let http: HttpTestingController;
  let sockets: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    sockets = [];
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: WEB_SOCKET,
          useValue: (url: string) => {
            sockets.push(url);
            throw new Error('the Chat tab opens no socket');
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

  /** Opens the Chat tab and answers the agent, the project's agents and the agent's start. */
  async function render() {
    // As wide as the page was, plus the sidebar.
    await page.viewport(1140, 1300);
    const agent = await goldenMaster(DRAFTED, 'getAgent', 'qits-workspaces');
    // The project's ACTIVE agents as the agent layout's spec answers them: the bug ticket's agent,
    // with no waits ("an agent whose workspace is starting", which the pact binds).
    const opened = await openRoute(
      (project) => `/projects/${project.slug}/agents/${agent.agentId}/chat`,
      { agents: STARTING },
    );
    http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
    await opened.settled();
    // The agent's start, asked of the agent (`getAgentActiveProcess`): none is running.
    http
      .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
      .flush(await goldenMaster(SLOT, 'getAgentActiveProcess', 'qits-workspaces'));
    await opened.settled();
    return { opened, agentId: agent.agentId as string };
  }

  it('shows a running agent’s transcript and its restored prompt draft', async () => {
    const { opened, agentId } = await render();
    http
      .expectOne(`https://workspaces.test/workspaces/agent/${agentId}/log?channel=TRANSCRIPT`)
      .flush(await goldenMaster(TURNS, 'getCommandLog', 'qits-workspace-daemon'));
    http
      .expectOne(`/workspaces/api/agents/${agentId}/prompt-draft`)
      .flush(await goldenMaster(DRAFTED, 'getAgentPromptDraft', 'qits-workspaces'));
    await opened.settled();
    const view = page.elementLocator(opened.page);
    const layout = page.elementLocator(opened.frame.querySelector('app-agent-layout')!);
    await expect
      .element(layout.getByRole('link', { name: 'Chat' }))
      .toHaveAttribute('aria-current', 'page');
    await expect.element(view.getByText('Fixed: the user name is trimmed')).toBeVisible();
    await expect.element(view.getByText('Restored draft from 4m ago')).toBeVisible();
    await expect
      .element(view.getByRole('textbox', { name: 'The prompt' }))
      .toHaveValue('Check the rounding in the invoice totals.');
    await expect.element(view.getByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(sockets).toEqual([]);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('transcript', { kind: 'DATA' });
  });

  /** Answers the transcript and the saved draft, as the tab reads them. */
  async function answerTab(opened: OpenedRoute, agentId: string) {
    http
      .expectOne(`https://workspaces.test/workspaces/agent/${agentId}/log?channel=TRANSCRIPT`)
      .flush(await goldenMaster(TURNS, 'getCommandLog', 'qits-workspace-daemon'));
    http
      .expectOne(`/workspaces/api/agents/${agentId}/prompt-draft`)
      .flush(await goldenMaster(DRAFTED, 'getAgentPromptDraft', 'qits-workspaces'));
    await opened.settled();
  }

  /** Picks lines 3-4 of the recorded source file, as the Files tab would; gives the pick's ↗. */
  async function pick(opened: OpenedRoute) {
    const file = await goldenMaster(FILES, 'readFile', 'qits-workspace-daemon');
    const excerpt = (file.content as string).split('\n').slice(2, 4).join('\n');
    TestBed.inject(PickedContext).add({ path: file.path, startLine: 3, endLine: 4, excerpt });
    await opened.settled();
    const view = page.elementLocator(opened.page);
    return { open: view.getByRole('button', { name: `Open ${file.path}:3-4` }), path: file.path };
  }

  /**
   * Lets the navigation an exit started finish, and answers every read the page it left for makes
   * with a 404 (an error answer is only a status): that page is its own spec's (`idle()`, not
   * `settled()`, qits-2056). Answers in rounds, until a round leaves nothing open.
   */
  async function leftFor(opened: OpenedRoute) {
    for (let round = 0, quiet = 0; round < 20 && quiet < 2; round++) {
      await opened.idle();
      const open = http.match(() => true).filter((request) => !request.cancelled);
      for (const request of open) request.flush(null, { status: 404, statusText: 'Not Found' });
      quiet = open.length ? 0 : quiet + 1;
    }
  }

  it('picked-reference: a pick from the Files tab, under the prompt', async () => {
    const { opened, agentId } = await render();
    await answerTab(opened, agentId);
    const { open } = await pick(opened);
    await expect.element(open).toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('picked-reference', { kind: 'DATA' });
  });

  it('open-picked-reference files: a pick’s ↗ opens its lines in the Files tab', async () => {
    const { opened, agentId } = await render();
    await answerTab(opened, agentId);
    const { open, path } = await pick(opened);
    await open.click();
    await leftFor(opened);
    expect(outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`)).toEqual([
      'open-picked-reference:files',
    ]);
    expect(TestBed.inject(Router).url).toBe(
      `/projects/${opened.project.slug}/agents/${agentId}/files?path=${encodeURIComponent(path)}&lines=3-4`,
    );
  });
});
