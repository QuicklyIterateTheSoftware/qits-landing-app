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
import { WorkspaceSlotPage } from './workspace-slot.page';
import { goldenMaster } from '../../../../../../testing/browser/golden-master';

/**
 * Screenshots of one workspace slot's page, answered with qits-workspaces' "a workspace slot
 * hosting agents": the slot RUNNING on runner `localhost` (its daemon not reported), no start
 * running against it, and its two agents — the bug ticket's, holding it and waiting on a release
 * request, and the epic's, yielded. The project is qits-projects' recorded one ("a project
 * exists"); the slot is the state's first row (`workspaceId`, frozen to 1).
 *
 * Its Stop is refused as qits-workspaces' "a workspace slot on a disconnected runner" refuses it
 * (409 `RUNNER_UNAVAILABLE`, the same slot row), and the page reads the slot again.
 *
 * The clock is pinned four minutes after the recordings' instants. The event stream never connects.
 */

const SLOT = 'a workspace slot hosting agents';
const OFFLINE = 'a workspace slot on a disconnected runner';
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

  /** Answers the slot's reads from "a workspace slot hosting agents". */
  async function answerSlot(harness: RouterTestingHarness, id: string) {
    http
      .expectOne(`/workspaces/api/workspaces/${id}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/agents?workspaceId=${id}`)
      .flush(await goldenMaster(SLOT, 'listAgents', 'qits-workspaces'));
    await answered(harness);
  }

  it('shows a refused stop in the service’s words', async () => {
    const id = '1';
    const { harness, element } = await render(id);
    await answerSlot(harness, id);
    const view = page.elementLocator(element);
    await view.getByRole('button', { name: 'Stop' }).click();
    await settle();
    const refusal = await goldenMaster(OFFLINE, 'stopWorkspaceContainer', 'qits-workspaces');
    http
      .expectOne(`/workspaces/api/workspaces/${id}/stop-container`)
      .flush(refusal, { status: 409, statusText: 'Conflict' });
    await answered(harness);
    await answerSlot(harness, id);
    await expect.element(view).toMatchTextContent(`That did not work — 409 ${refusal.message}.`);
    await expect.element(view).toMatchScreenshot('stop-refused');
  });

  it('shows the slot’s status strip and the agents it hosts', async () => {
    const id = '1';
    const { harness, element, project } = await render(id);
    http
      .expectOne(`/workspaces/api/workspaces/${id}`)
      .flush(await goldenMaster(SLOT, 'getWorkspace', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/workspaces/${id}/active-process`)
      .flush(await goldenMaster(SLOT, 'getWorkspaceActiveProcess', 'qits-workspaces'));
    http
      .expectOne(`/workspaces/api/agents?workspaceId=${id}`)
      .flush(await goldenMaster(SLOT, 'listAgents', 'qits-workspaces'));
    await answered(harness);
    const view = page.elementLocator(element);
    await expect
      .element(view.getByRole('heading', { name: 'Workspace ws-contract' }))
      .toBeVisible();
    await expect.element(view).toMatchTextContent('on runner localhost');
    await expect.element(view).toMatchTextContent('2 agents');
    await expect.element(view.getByRole('region', { name: 'Starting' })).not.toBeInTheDocument();
    await expect
      .element(view.getByRole('link', { name: 'contract-00000001-2' }))
      .toHaveAttribute('href', `/projects/${project.slug}/work/detail/contract-00000001-2/agent`);
    await expect.element(view).toMatchTextContent('yielded — idle, terminal stays live');
    await expect
      .element(view.getByRole('group', { name: 'Container' }).getByRole('button', { name: 'Stop' }))
      .toBeVisible();
    await expect.element(view).toMatchScreenshot('slot');
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
      .expectOne('/workspaces/api/agents?workspaceId=2')
      .flush(null, { status: 404, statusText: 'Not Found' });
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view).toMatchTextContent('This workspace is gone');
    await expect.element(view).toMatchScreenshot('gone');
  });
});
