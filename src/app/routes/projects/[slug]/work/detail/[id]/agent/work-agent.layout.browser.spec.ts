import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { page } from 'vitest/browser';
import { client as projectsClient } from '../../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../../../../../api/workspaces/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../../../../../testing/platform-origins';
import { answerCampaignReads, campaignsIn } from '../../../../../../../../testing/campaign-reads';
import { WorkAgentLayout } from './work-agent.layout';
import { goldenMaster } from '../../../../../../../../testing/browser/golden-master';

/**
 * Screenshots of a work item's agent page. The project and its work are qits-projects' recordings
 * ("a project exists", "a bug ticket in detail", whose campaign is described by "a campaign in
 * detail"); the agent is qits-workspaces' "an agent whose workspace is starting", whose ids are
 * those of the "… in detail" states: the bug ticket's agent, waiting on a release request (a
 * declared wait, so nobody waits on a person), in a slot whose container is coming up on runner
 * `localhost` while a start is live. The start's log stream opens but sends nothing here: the log's
 * segments are `ui-segment-log`'s own screenshots.
 *
 * The clock is pinned four minutes after the recordings' instants. The event stream never connects.
 */

const ITEM = 'contract-00000001-10';
const WORK = 'a bug ticket in detail';
const STARTING = 'an agent whose workspace is starting';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('WorkAgentLayout (screenshots)', () => {
  let http: HttpTestingController;
  let streams: string[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    streams = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work/detail/:id/agent',
            component: WorkAgentLayout,
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

  /** Opens the item's agent page and answers the project, its work and its campaign's reads. */
  async function render() {
    await page.viewport(900, 900);
    const list = await goldenMaster('a project exists', 'listProjects');
    const project = list.entries[0].project;
    const harness = await RouterTestingHarness.create();
    const navigated = harness.navigateByUrl(`/projects/${project.slug}/work/detail/${ITEM}/agent`);
    await settle();
    http.expectOne('/projects/api/projects').flush(list);
    await navigated;
    await answered(harness);
    const work = await goldenMaster(WORK, 'listProjectWork');
    http.expectOne(`/projects/api/projects/${project.id}/work`).flush(work);
    await answered(harness);
    await answerCampaignReads(http, goldenMaster, campaignsIn(work), {
      members: WORK,
      described: ['a campaign in detail'],
    });
    await answered(harness);
    const element = harness.routeNativeElement as HTMLElement;
    element.style.width = '900px';
    return { harness, element, project };
  }

  it('shows the agent, what it waits on, and its slot coming up', async () => {
    const { harness, element, project } = await render();
    const agents = await goldenMaster(STARTING, 'listAgents', 'qits-workspaces');
    http.expectOne(`/workspaces/api/agents?workId=${agents.agents[0].workId}`).flush(agents);
    await answered(harness);
    const slot = agents.agents[0].workspaceRowId;
    http
      .expectOne(`/workspaces/api/workspaces/${slot}`)
      .flush(await goldenMaster(STARTING, 'getWorkspace', 'qits-workspaces'));
    const process = await goldenMaster(STARTING, 'getWorkspaceActiveProcess', 'qits-workspaces');
    http.expectOne(`/workspaces/api/workspaces/${slot}/active-process`).flush(process);
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('heading', { name: `Agent ${ITEM}` })).toBeVisible();
    await expect
      .element(view.getByRole('status'))
      .toHaveTextContent(
        'waiting on release-request 00000000-0000-4000-8000-0000000000c1 · 4m ago',
      );
    await expect.element(view).not.toMatchTextContent('waiting on you');
    await expect
      .element(view.getByRole('link', { name: 'ws-contract' }))
      .toHaveAttribute('href', `/projects/${project.slug}/workspaces/${slot}`);
    await expect.element(view).toMatchTextContent('provisioning');
    await expect.element(view.getByRole('region', { name: 'Starting' })).toBeVisible();
    expect(streams).toEqual([
      `https://workspaces.test/workspaces/api/technical-processes/${process.technicalProcessId}/events`,
    ]);
    await expect.element(view).toMatchScreenshot('starting');
  });

  it('marks the agent as failed to load', async () => {
    const { harness, element } = await render();
    const agents = await goldenMaster(STARTING, 'listAgents', 'qits-workspaces');
    // An error answer is a status only: the read fails, and the page says so.
    http
      .expectOne(`/workspaces/api/agents?workId=${agents.agents[0].workId}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await answered(harness);
    const view = page.elementLocator(element);
    await expect.element(view.getByRole('img', { name: 'Failed to load' })).toBeVisible();
    await expect.element(view).toMatchScreenshot('error');
  });
});
