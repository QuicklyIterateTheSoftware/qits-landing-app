import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { page } from 'vitest/browser';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';
import {
  openRoute,
  provideAppRoute,
  type OpenedRoute,
} from '../../../../../../testing/browser/app-route';

/**
 * Screenshots of one workspace slot's page inside the shell (`openRoute`), answered with
 * qits-workspaces' "a workspace slot hosting agents": the slot RUNNING on runner `localhost` (its
 * daemon not reported), no start running against it, and its two agents — the bug ticket's, holding
 * it and waiting on a release request, and the epic's, yielded. The project is qits-projects'
 * recorded one ("a project exists"); the slot is the state's first row (`workspaceId`, frozen to
 * 1).
 *
 * The clock is pinned four minutes after the recordings' instants. The event stream never connects.
 *
 * The agents it hosts are read with `listWorkspaceAgents` (epic qits-1667).
 *
 * The container's harness install (epic qits-1667, moved here from the agent's Terminal tab) is
 * qits-workspace-daemon's slot 1: the harness signed in ("a workspace daemon with a signed-in
 * harness") or nobody signed in ("… a harness nobody signed in", the sign-in notice), and the
 * plugins on the shared agent home ("a workspace daemon with plugins installed").
 *
 * No longer screenshots a refused Stop (epic qits-1481, ahead of qits-workspaces-service dropping
 * the offline-runner refusal in qits-1532): that case bound the pact's "a workspace slot on a
 * disconnected runner" / `stopWorkspaceContainer` interaction, which this epic's qits-1533 removed.
 */

const SLOT = 'a workspace slot hosting agents';
const SIGNED_IN = 'a workspace daemon with a signed-in harness';
const SIGNED_OUT = 'a workspace daemon with a harness nobody signed in';
const PLUGINS = 'a workspace daemon with plugins installed';
const NOW = new Date('2026-01-01T00:04:00Z');

describe('WorkspaceSlotPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideAppRoute(),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: WEB_SOCKET,
          useValue: () => {
            throw new Error('no sign-in terminal is open');
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

  async function render(slotId: string) {
    // As wide as the page was, plus the sidebar; tall enough for the whole page, as the shell shows
    // only what is in the viewport.
    await page.viewport(1140, 1040);
    const opened = await openRoute((project) => `/projects/${project.slug}/workspaces/${slotId}`);
    return { opened, element: opened.page, project: opened.project };
  }

  /**
   * Makes the viewport tall enough for the whole page, so a screenshot holds all of it at every
   * width it is shot at (each is as tall as the viewport, `toMatchScreenshot`). The page is
   * measured at the phone's width, where it is tallest: there the document scrolls and the frame
   * grows with the page (the shell's `<main>` scrolls on its own from 768px up only).
   */
  async function fitWholePage(opened: OpenedRoute) {
    const width = window.innerWidth;
    await page.viewport(390, 844);
    await opened.settled();
    const height = opened.frame.scrollHeight;
    await page.viewport(width, Math.max(height, 900) + 40);
    await opened.settled();
  }

  /** Answers the slot's reads from "a workspace slot hosting agents", and its harness install. */
  async function answerSlot(opened: OpenedRoute, id: string, report = SIGNED_IN) {
    http
      .expectOne(`/workspaces/api/workspaces/${id}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/agents`)
      .flush(await goldenMaster(SLOT, 'listWorkspaceAgents', 'qits-workspaces'));
    await opened.settled();
    const base = `https://workspaces.test/workspaces/container/${id}`;
    http
      .expectOne(`${base}/agents/available`)
      .flush(await goldenMaster(report, 'availableAgents', 'qits-workspace-daemon'));
    http
      .expectOne(`${base}/agent-plugins`)
      .flush(await goldenMaster(PLUGINS, 'listPlugins', 'qits-workspace-daemon'));
    await opened.settled();
  }

  it('shows the slot’s status strip and the agents it hosts', async () => {
    const id = '1';
    const { opened, element, project } = await render(id);
    await answerSlot(opened, id);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('heading', { name: 'Workspace ws-contract' }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('placed on a runner');
    await expect.element(view).toMatchTextContent('2 agents');
    await expect.element(view.getByRole('region', { name: 'Starting' })).not.toBeInTheDocument();
    const hosted = await goldenMaster(SLOT, 'listWorkspaceAgents', 'qits-workspaces');
    const agentId = hosted.agents.find(
      (a: { entityId?: string }) => a.entityId === 'contract-00000001-1',
    ).agentId;
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-1' }))
      .toHaveAttribute('href', `/projects/${project.slug}/agents/${agentId}`);
    await expect.element(view).toMatchTextContent('yielded — idle, terminal stays live');
    await expect
      .element(view.getByRole('group', { name: 'Container' }).getByRole('button', { name: 'Stop' }))
      .toBeVisible();
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('slot', { kind: 'DATA' });
  });

  it('names the agents a stop affects before it is confirmed', async () => {
    const id = '1';
    const { opened, element } = await render(id);
    await answerSlot(opened, id);
    const view = page.elementLocator(element);
    await view
      .getByRole('group', { name: 'Container' })
      .getByRole('button', { name: 'Stop' })
      .click();
    opened.harness.fixture.detectChanges();
    await expect.element(view.getByRole('button', { name: 'Confirm stop?' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent(
        'Stopping the container affects its 2 agents: contract-00000001-1, contract-00000001-9.',
      );
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('confirm-stop', { kind: 'DATA' });
  });

  it('says nobody signed the container’s harness in, and offers the sign-in terminal', async () => {
    const id = '1';
    const { opened, element } = await render(id);
    await answerSlot(opened, id, SIGNED_OUT);
    const notice = page.elementLocator(element.querySelector('app-sign-in-notice')!);
    await expect.element(notice).toMatchTextContent('Nobody has signed Claude Code in');
    await expect
      .element(notice.getByRole('button', { name: 'Open the sign-in terminal' }))
      .toBeVisible();
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('sign-in-notice', { kind: 'NO_DATA' });
  });

  it('lists the plugins on the shared agent home', async () => {
    const id = '1';
    const { opened, element } = await render(id);
    await answerSlot(opened, id);
    const plugins = page.elementLocator(element.querySelector('app-plugins-section')!);
    await expect.element(plugins).toMatchTextContent('installed, switched off');
    await expect.element(plugins.getByRole('button', { name: 'Install' }).first()).toBeVisible();
    await fitWholePage(opened);
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('plugins', { kind: 'DATA' });
  });

  it('says a slot that answers 404 is gone', async () => {
    const { opened, element } = await render('2');
    http
      .expectOne('/workspaces/api/workspaces/2')
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne('/workspaces/api/workspaces/2/active-process')
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne('/workspaces/api/workspaces/2/agents')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await opened.settled();
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('This workspace is gone');
    await expect
      .element(page.elementLocator(opened.frame))
      .toMatchScreenshot('gone', { kind: 'ERROR' });
  });
});
