import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, computed, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { client as workspacesClient } from '../../../api/workspaces/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { loadState } from '$core/resources/load-state';
import { ProjectActiveAgents } from '$core/workspaces/project-active-agents';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { AgentsMenu } from './agents-menu';
import { goldenMaster } from '../../../../testing/browser/golden-master';

/**
 * Screenshots of the top bar's agents menu (epic qits-1681), its agents qits-workspaces' golden
 * master "a project with agents needing attention": the bug ticket's agent waits on a release
 * request that is already FINALIZED, the epic's agent is blocked with no `@desk` answer, the PDF
 * ticket's agent is idle, the download ticket's agent is overdue on a CI run, and the "remember the
 * format" ticket's agent waits on another item and its comments (not overdue, no badge). The open
 * project is qits-projects' recorded one ("a project exists", slug `contract-00000001`), which the
 * state's entity ids name (the two providers' frozen ids are unrelated). qits-ci's page origin
 * answers the run wait's link; the project has no release requests ("a project with no release
 * requests", `ProjectReleaseRequests`), so the request wait falls back to its own state and no
 * lifecycle line. The menu is drawn as the shell draws it (`Shell`), handed `ProjectActiveAgents`'
 * resource (qits-2146).
 *
 * And the golden master "a project with agents starting up" (qits-2007): one agent per start-up
 * phase (queued with no slot, provisioning its workspace, launching its session) and two READY,
 * one idle and one working. The clock is pinned four minutes after the state's `phaseSince`, so
 * each start-up chip reads "4 min".
 *
 * And "a project with an agent overdue on a release request" (qits-2040): the request unchanged
 * for hours, so its action opens the request, and a wait on the item's comments.
 *
 * Its links are declared exits (epic qits-2000), each followed once to a stub of its page:
 * `open-menu-agent` (`agent`), `open-menu-agent-wait` (`releaseRequest`, `workItem`, `comments`),
 * `act-on-menu-agent-attention` (`prompt`, `openItem`, `overdueRequest`) and `open-all-agents`
 * (`agents`). A run stays qits-ci's link, no outcome.
 */

const NEEDING_ATTENTION = 'a project with agents needing attention';
const STARTING_UP = 'a project with agents starting up';
const OVERDUE = 'a project with an agent overdue on a release request';
const NOW = new Date('2026-01-01T00:04:00Z');

/** The shell's part, laid out as nothing of its own: it hands the menu the open project's agents. */
@Component({
  imports: [AgentsMenu],
  host: { class: 'contents' },
  template: `<app-agents-menu [agents]="active.resource" [state]="state()" />`,
})
class Shell {
  protected readonly active = inject(ProjectActiveAgents);
  protected readonly state = computed(() => loadState(this.active.resource));
}

/** The routed page under the menu; it renders nothing. */
@Component({ selector: 'app-test-page', template: `` })
class TestPage {}

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AgentsMenu (screenshots)', () => {
  let http: HttpTestingController;
  let projectId: string;
  let slug: string;

  beforeEach(async () => {
    const recorded = (await goldenMaster('a project exists', 'getProject')).project;
    projectId = recorded.id;
    slug = recorded.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug', component: TestPage },
          { path: 'projects/:slug/agents', component: TestPage },
          { path: 'projects/:slug/agents/:agentId', component: TestPage },
          { path: 'projects/:slug/agents/:agentId/chat', component: TestPage },
          { path: 'projects/:slug/release-requests/:requestId', component: TestPage },
          { path: 'projects/:slug/work/detail/:id', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideHeyApiClient(workspacesClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.test' }),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        // The agents' and the release requests' resources follow that stream (qits-2146).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The menu at the right of a narrow bar, room below it for the panel; nothing opened yet. */
  async function render() {
    await TestBed.inject(Router).navigateByUrl(`/projects/${slug}`);
    const fixture = TestBed.createComponent(Shell);
    const element = fixture.nativeElement as HTMLElement;
    element.parentElement!.style.cssText =
      'display:flex; justify-content:flex-end; width:25rem; height:34rem; padding:0.5rem; align-items:flex-start';
    fixture.detectChanges();
    await settle();
    // In the browser `SelectedProject` reads the project list on its own; answer it as recorded.
    http
      .expectOne('/projects/api/projects')
      .flush(await goldenMaster('a project exists', 'listProjects'));
    await settle();
    fixture.detectChanges();
    await settle();
    const agents = http.expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`);
    http
      .expectOne(`/projects/api/projects/${projectId}/release-requests`)
      .flush(
        await goldenMaster('a project with no release requests', 'listProjectReleaseRequests'),
      );
    return { fixture, frame: page.elementLocator(element.parentElement!), agents };
  }

  async function answered(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('is a closed button badged with the agents needing a person', async () => {
    const { fixture, frame, agents } = await render();
    agents.flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    await expect
      .element(page.getByRole('button', { name: 'Agents' }))
      .toHaveAttribute('aria-expanded', 'false');
    // Four of the five agents need a person (the fifth's wait is open but not yet overdue).
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button span[aria-hidden="true"]')
        ?.textContent,
    ).toBe('4');
    await expect.element(frame).toMatchScreenshot('closed', { kind: 'DATA' });
  });

  it('lists each agent with what it waits on and what needs a person', async () => {
    const { fixture, frame, agents } = await render();
    agents.flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    await userEvent.click(page.getByRole('button', { name: 'Agents' }));
    fixture.detectChanges();
    await settle();
    // Each opening reads the agents again, as the lightning menu reads its requests.
    http
      .expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`)
      .flush(await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    const panel = page.getByRole('region', { name: "The project's agents" });
    expect(panel.getByRole('listitem').elements()).toHaveLength(5);
    await expect
      .element(panel.getByRole('link', { name: /contract-00000001-9/ }))
      .toHaveAttribute('href', `/projects/${slug}/agents/00000000-0000-4000-8000-0000000000a6`);
    await expect.element(panel).toMatchTextContent('Blocked 50 min by contract-person');
    await expect
      .element(panel.getByRole('link', { name: 'CI run 00000000' }).first())
      .toHaveAttribute('href', 'https://ci.test/runs/00000000-0000-4000-8000-0000000000c2');
    await expect.element(panel.getByRole('link', { name: 'Open item' })).toBeVisible();
    await expect.element(panel.getByRole('link', { name: 'Prompt agent' }).first()).toBeVisible();
    await expect.element(frame).toMatchScreenshot('open', { kind: 'DATA' });
  });

  /** The menu opened on `state`'s agents (read on render, and again on the opening). */
  async function opened(state: string) {
    const rendered = await render();
    const { fixture, agents } = rendered;
    agents.flush(await goldenMaster(state, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    await userEvent.click(page.getByRole('button', { name: 'Agents' }));
    fixture.detectChanges();
    await settle();
    http
      .expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`)
      .flush(await goldenMaster(state, 'listAgents', 'qits-workspaces'));
    await answered(fixture);
    const panel = page.getByRole('region', { name: "The project's agents" });
    const element = fixture.nativeElement as HTMLElement;
    /** The row of the agent on `entityId`. */
    const row = (entityId: string) =>
      page.elementLocator(
        [...element.querySelectorAll<HTMLElement>('li')].find(
          (li) => li.querySelector('span.font-semibold')?.textContent?.trim() === entityId,
        )!,
      );
    return { ...rendered, panel, row };
  }

  /** Clicks `link` and gives where it led and the outcomes the test reached. */
  async function follow(link: ReturnType<typeof page.elementLocator>) {
    await userEvent.click(link);
    await settle();
    await settle();
    return {
      url: TestBed.inject(Router).url,
      reached: outcomeRecords().map((r) => `${r.interaction}:${r.outcome}`),
    };
  }

  it('shows an agent overdue on a release request, with the request as its action', async () => {
    const { frame, row } = await opened(OVERDUE);
    const overdue = row('contract-00000001-11');
    await expect
      .element(overdue.getByRole('link', { name: 'Comments on contract-00000001-11' }))
      .toBeVisible();
    await expect
      .element(overdue.getByRole('link', { name: 'contract-qits-rr-369' }).last())
      .toHaveAttribute('data-action');
    await commands.parkPointer();
    await expect.element(frame).toMatchScreenshot('overdue-on-a-request', { kind: 'DATA' });
  });

  it('open-menu-agent agent: an agent’s item opens the agent’s page', async () => {
    const { panel } = await opened(NEEDING_ATTENTION);
    const { url, reached } = await follow(panel.getByRole('link', { name: /contract-00000001-9/ }));
    expect(url).toBe(`/projects/${slug}/agents/00000000-0000-4000-8000-0000000000a6`);
    expect(reached).toEqual(['open-menu-agent:agent']);
  });

  it('open-menu-agent-wait releaseRequest: a request wait opens the request', async () => {
    const { panel } = await opened(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      panel.getByRole('link', { name: 'contract-qits-rr-368', exact: true }),
    );
    expect(url).toBe(`/projects/${slug}/release-requests/contract-qits-rr-368`);
    expect(reached).toEqual(['open-menu-agent-wait:releaseRequest']);
  });

  it('open-menu-agent-wait workItem: a wait on an item opens the item', async () => {
    const { row } = await opened(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      row('contract-00000001-10').getByRole('link', { name: 'contract-00000001-4', exact: true }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-4`);
    expect(reached).toEqual(['open-menu-agent-wait:workItem']);
  });

  it('open-menu-agent-wait comments: a wait on an item’s comments opens the item', async () => {
    const { row } = await opened(OVERDUE);
    const { url, reached } = await follow(
      row('contract-00000001-11').getByRole('link', { name: 'Comments on contract-00000001-11' }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-11`);
    expect(reached).toEqual(['open-menu-agent-wait:comments']);
  });

  it('act-on-menu-agent-attention prompt: Prompt agent opens the agent’s Chat tab', async () => {
    const { row } = await opened(NEEDING_ATTENTION);
    const listed = await goldenMaster(NEEDING_ATTENTION, 'listAgents', 'qits-workspaces');
    const idle = listed.agents.find(
      (a: { attention?: { code?: string } }) => a.attention?.code === 'IDLE_NO_WAIT',
    );
    const { url, reached } = await follow(
      row(idle.entityId).getByRole('link', { name: 'Prompt agent' }),
    );
    expect(url).toBe(`/projects/${slug}/agents/${idle.agentId}/chat`);
    expect(reached).toEqual(['act-on-menu-agent-attention:prompt']);
  });

  it('act-on-menu-agent-attention openItem: Open item opens a blocked agent’s item', async () => {
    const { row } = await opened(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      row('contract-00000001-1').getByRole('link', { name: 'Open item' }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-1`);
    expect(reached).toEqual(['act-on-menu-agent-attention:openItem']);
  });

  it('act-on-menu-agent-attention overdueRequest: an overdue request’s action opens it', async () => {
    const { row } = await opened(OVERDUE);
    const { url, reached } = await follow(
      row('contract-00000001-11').getByRole('link', { name: 'contract-qits-rr-369' }).last(),
    );
    expect(url).toBe(`/projects/${slug}/release-requests/contract-qits-rr-369`);
    expect(reached).toEqual(['act-on-menu-agent-attention:overdueRequest']);
  });

  it('open-all-agents agents: All agents opens the project’s Agents page', async () => {
    const { panel } = await opened(NEEDING_ATTENTION);
    const { url, reached } = await follow(panel.getByRole('link', { name: 'All agents' }));
    expect(url).toBe(`/projects/${slug}/agents`);
    expect(reached).toEqual(['open-all-agents:agents']);
  });

  describe('while the agents start up', () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOW }));
    afterEach(() => vi.useRealTimers());

    it('shows where each agent’s start stands, and for how long', async () => {
      const { fixture, frame, agents } = await render();
      agents.flush(await goldenMaster(STARTING_UP, 'listAgents', 'qits-workspaces'));
      await answered(fixture);
      await userEvent.click(page.getByRole('button', { name: 'Agents' }));
      fixture.detectChanges();
      await settle();
      http
        .expectOne(`/workspaces/api/agents?projectId=${projectId}&state=ACTIVE`)
        .flush(await goldenMaster(STARTING_UP, 'listAgents', 'qits-workspaces'));
      await answered(fixture);
      const panel = page.getByRole('region', { name: "The project's agents" });
      expect(panel.getByRole('listitem').elements()).toHaveLength(5);
      const chips = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('[data-activity]'),
      ).map((chip) => chip.textContent?.trim());
      expect(chips).toEqual([
        'Queued: waiting for a slot · 4 min',
        'Starting: provisioning workspace · 4 min',
        'Starting: launching session · 4 min',
        'Idle',
        'Working',
      ]);
      await expect.element(frame).toMatchScreenshot('starting-up', { kind: 'DATA' });
    });
  });
});
