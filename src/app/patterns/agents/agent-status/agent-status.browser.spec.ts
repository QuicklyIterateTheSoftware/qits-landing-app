import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { commands, page, userEvent } from 'vitest/browser';
import { client as projectsClient } from '../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../../../../testing/platform-origins';
import { goldenMaster } from '../../../../testing/browser/golden-master';
import type { ProjectStatusAgent } from '$core/workspaces/agents.consumes';
import { AgentStatus } from './agent-status';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const NEEDING_ATTENTION = 'a project with agents needing attention';
const OVERDUE = 'a project with an agent overdue on a release request';

/**
 * Screenshots of what agents wait on and need a person for (epic qits-1681), 40rem wide, one block
 * per agent of a recorded `listAgents` of qits-workspaces: "a project with agents needing
 * attention" (a request wait already FINALIZED → Prompt agent; blocked with no `@desk` answer →
 * Open item; idle → Prompt agent; overdue on a CI run → the run, qits-ci's page; a wait on another
 * item and on its comments, not overdue) and "a project with an agent overdue on a release
 * request" (qits-2040: the request unchanged for hours → the request; and a wait on the item's
 * comments). The open project is qits-projects' "a project exists" (slug `contract-00000001`),
 * which the states' entity ids name; no release request or work is loaded, so a subject falls back
 * to what the wait names.
 *
 * Its links are declared exits (epic qits-2000), each followed once to a stub of its page:
 * `open-agent-wait` (`releaseRequest`, `workItem`, `comments`) and `act-on-agent-attention`
 * (`prompt`, `openItem`, `overdueRequest`). A run stays qits-ci's link, no outcome.
 */
@Component({
  imports: [AgentStatus],
  host: { class: 'flex w-[40rem] flex-col gap-3 p-4' },
  template: `
    @for (agent of agents(); track agent.agentId) {
      <div class="rounded-md border border-line p-2" [attr.data-entity]="agent.entityId">
        <app-agent-status [agent]="agent" />
      </div>
    }
  `,
})
class Statuses {
  readonly agents = input.required<readonly ProjectStatusAgent[]>();
}

describe('AgentStatus (screenshots)', () => {
  let http: HttpTestingController;
  let slug: string;

  beforeEach(async () => {
    slug = (await goldenMaster('a project exists', 'getProject')).project.slug;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'projects/:slug', children: [] },
          { path: 'projects/:slug/release-requests/:requestId', children: [] },
          { path: 'projects/:slug/work/detail/:id', children: [] },
          { path: 'projects/:slug/agents/:agentId/chat', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideTestPlatformOrigins({}, { ci: 'https://ci.test' }),
        // No live stream in a screenshot: the real DomainEvents, on a stream that never connects.
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The open project's page, then each agent of `state`'s `listAgents`. */
  async function shown(state: string) {
    await TestBed.inject(Router).navigateByUrl(`/projects/${slug}`);
    const listed = await goldenMaster(state, 'listAgents', 'qits-workspaces');
    const fixture = TestBed.createComponent(Statuses);
    fixture.componentRef.setInput('agents', listed.agents);
    fixture.detectChanges();
    await settle();
    // In the browser the store loads the project list on its own; answer it as recorded.
    for (const request of http.match('/projects/api/projects')) {
      request.flush(await goldenMaster('a project exists', 'listProjects'));
    }
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const agent = (entityId: string) =>
      page.elementLocator(element.querySelector<HTMLElement>(`[data-entity="${entityId}"]`)!);
    return { locator: page.elementLocator(element), agent, agents: listed.agents };
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

  it('needing-attention', async () => {
    const { locator, agent } = await shown(NEEDING_ATTENTION);
    await expect
      .element(agent('contract-00000001-9').getByRole('link', { name: 'contract-qits-rr-368' }))
      .toHaveAttribute('href', `/projects/${slug}/release-requests/contract-qits-rr-368`);
    await expect
      .element(agent('contract-00000001-4').getByRole('link', { name: 'CI run 00000000' }).first())
      .toHaveAttribute('href', 'https://ci.test/runs/00000000-0000-4000-8000-0000000000c2');
    await expect
      .element(agent('contract-00000001-10').getByRole('link', { name: 'contract-00000001-4' }))
      .toBeVisible();
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('needing-attention', { kind: 'DATA' });
  });

  it('overdue-on-a-request', async () => {
    const { locator, agent } = await shown(OVERDUE);
    const overdue = agent('contract-00000001-11');
    await expect
      .element(overdue.getByRole('link', { name: 'Comments on contract-00000001-11' }))
      .toBeVisible();
    await expect
      .element(overdue.getByRole('link', { name: 'contract-qits-rr-369' }).last())
      .toHaveAttribute('data-action');
    await commands.parkPointer();
    await expect.element(locator).toMatchScreenshot('overdue-on-a-request', { kind: 'DATA' });
  });

  it('open-agent-wait releaseRequest: a request wait opens the request', async () => {
    const { agent } = await shown(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      agent('contract-00000001-9').getByRole('link', { name: 'contract-qits-rr-368' }),
    );
    expect(url).toBe(`/projects/${slug}/release-requests/contract-qits-rr-368`);
    expect(reached).toEqual(['open-agent-wait:releaseRequest']);
  });

  it('open-agent-wait workItem: a wait on an item opens the item', async () => {
    const { agent } = await shown(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      agent('contract-00000001-10').getByRole('link', { name: 'contract-00000001-4' }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-4`);
    expect(reached).toEqual(['open-agent-wait:workItem']);
  });

  it('open-agent-wait comments: a wait on an item’s comments opens the item', async () => {
    const { agent } = await shown(OVERDUE);
    const { url, reached } = await follow(
      agent('contract-00000001-11').getByRole('link', { name: 'Comments on contract-00000001-11' }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-11`);
    expect(reached).toEqual(['open-agent-wait:comments']);
  });

  it('act-on-agent-attention prompt: Prompt agent opens the agent’s Chat tab', async () => {
    const { agent, agents } = await shown(NEEDING_ATTENTION);
    const idle = agents.find((a: ProjectStatusAgent) => a.attention?.code === 'IDLE_NO_WAIT');
    const { url, reached } = await follow(
      agent(idle.entityId).getByRole('link', { name: 'Prompt agent' }),
    );
    expect(url).toBe(`/projects/${slug}/agents/${idle.agentId}/chat`);
    expect(reached).toEqual(['act-on-agent-attention:prompt']);
  });

  it('act-on-agent-attention openItem: Open item opens a blocked agent’s item', async () => {
    const { agent } = await shown(NEEDING_ATTENTION);
    const { url, reached } = await follow(
      agent('contract-00000001-1').getByRole('link', { name: 'Open item' }),
    );
    expect(url).toBe(`/projects/${slug}/work/detail/contract-00000001-1`);
    expect(reached).toEqual(['act-on-agent-attention:openItem']);
  });

  it('act-on-agent-attention overdueRequest: an overdue request’s action opens it', async () => {
    const { agent } = await shown(OVERDUE);
    const { url, reached } = await follow(
      agent('contract-00000001-11').getByRole('link', { name: 'contract-qits-rr-369' }).last(),
    );
    expect(url).toBe(`/projects/${slug}/release-requests/contract-qits-rr-369`);
    expect(reached).toEqual(['act-on-agent-attention:overdueRequest']);
  });
});
