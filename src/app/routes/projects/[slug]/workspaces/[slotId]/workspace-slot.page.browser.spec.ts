import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../api/workspaces/client.gen';
import { client as workspaceDaemonClient } from '../../../../../api/workspace-daemon/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { provideTestPlatformOrigins } from '../../../../../../testing/platform-origins';
import { WorkspaceSlotPage } from './workspace-slot.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of one workspace slot's page, answered with qits-workspaces' "a workspace slot
 * hosting agents": the slot RUNNING on runner `localhost` (its daemon not reported), no start
 * running against it, and its two agents — the bug ticket's, holding it and waiting on a release
 * request, and the epic's, yielded. The project is qits-projects' recorded one ("a project
 * exists"); the slot is the state's first row (`workspaceId`, frozen to 1).
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

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkspaceSlotPage (screenshots)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug/workspaces/:slotId', component: WorkspaceSlotPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideHeyApiClient(workspaceDaemonClient),
        provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
        {
          provide: WEB_SOCKET,
          useValue: () => {
            throw new Error('no sign-in terminal is open');
          },
        },
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
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
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/workspaces/${slotId}`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    TestBed.tick();
    await settle();
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project };
  }

  async function answered(harness: RouterTestingHarness) {
    await settle();
    TestBed.tick();
    await settle();
    harness.fixture.detectChanges();
  }

  /** Answers the slot's reads from "a workspace slot hosting agents", and its harness install. */
  async function answerSlot(harness: RouterTestingHarness, id: string, report = SIGNED_IN) {
    http
      .expectOne(`/workspaces/api/workspaces/${id}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/agents`)
      .flush(await goldenMaster(SLOT, 'listWorkspaceAgents', 'qits-workspaces'));
    await answered(harness);
    const base = `https://workspaces.test/workspaces/container/${id}`;
    http
      .expectOne(`${base}/agents/available`)
      .flush(await goldenMaster(report, 'availableAgents', 'qits-workspace-daemon'));
    http
      .expectOne(`${base}/agent-plugins`)
      .flush(await goldenMaster(PLUGINS, 'listPlugins', 'qits-workspace-daemon'));
    await answered(harness);
  }

  it('shows the slot’s status strip and the agents it hosts', async () => {
    const id = '1';
    const { harness, element, project } = await render(id);
    await answerSlot(harness, id);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('heading', { name: 'Workspace ws-contract' }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('placed on a runner');
    await expect.element(view).toMatchTextContent('2 agents');
    await expect.element(view.getByRole('region', { name: 'Starting' })).not.toBeInTheDocument();
    const hosted = await goldenMaster(SLOT, 'listWorkspaceAgents', 'qits-workspaces');
    const agentId = hosted.agents.find(
      (a: { entityId?: string }) => a.entityId === 'contract-00000001-2',
    ).agentId;
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-2' }))
      .toHaveAttribute('href', `/projects/${project.slug}/agents/${agentId}`);
    await expect.element(view).toMatchTextContent('yielded — idle, terminal stays live');
    await expect
      .element(view.getByRole('group', { name: 'Container' }).getByRole('button', { name: 'Stop' }))
      .toBeVisible();
    await expect.element(view).toMatchScreenshot('slot');
  });

  it('names the agents a stop affects before it is confirmed', async () => {
    const id = '1';
    const { harness, element } = await render(id);
    await answerSlot(harness, id);
    const view = page.elementLocator(element);
    await view
      .getByRole('group', { name: 'Container' })
      .getByRole('button', { name: 'Stop' })
      .click();
    harness.fixture.detectChanges();
    await expect.element(view.getByRole('button', { name: 'Confirm stop?' })).toBeVisible();
    await expect
      .element(view)
      .toMatchTextContent(
        'Stopping the container affects its 2 agents: contract-00000001-2, contract-00000001-10.',
      );
    await expect.element(view).toMatchScreenshot('confirm-stop');
  });

  it('says nobody signed the container’s harness in, and offers the sign-in terminal', async () => {
    const id = '1';
    const { harness, element } = await render(id);
    await answerSlot(harness, id, SIGNED_OUT);
    const notice = page.elementLocator(element.querySelector('app-sign-in-notice')!);
    await expect.element(notice).toMatchTextContent('Nobody has signed Claude Code in');
    await expect
      .element(notice.getByRole('button', { name: 'Open the sign-in terminal' }))
      .toBeVisible();
    await expect.element(notice).toMatchScreenshot('sign-in-notice');
  });

  it('lists the plugins on the shared agent home', async () => {
    const id = '1';
    const { harness, element } = await render(id);
    await answerSlot(harness, id);
    const plugins = page.elementLocator(element.querySelector('app-plugins-section')!);
    await expect.element(plugins).toMatchTextContent('installed, switched off');
    await expect.element(plugins.getByRole('button', { name: 'Install' }).first()).toBeVisible();
    await expect.element(plugins).toMatchScreenshot('plugins');
  });

  it('says a slot that answers 404 is gone', async () => {
    const { harness, element } = await render('2');
    http
      .expectOne('/workspaces/api/workspaces/2')
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne('/workspaces/api/workspaces/2/active-process')
      .flush(null, { status: 404, statusText: 'Not Found' });
    http
      .expectOne('/workspaces/api/workspaces/2/agents')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('This workspace is gone');
    await expect.element(view).toMatchScreenshot('gone');
  });
});
