import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
// Keep `./app.routes` above `domain-events`. Under `ng test` the environment is the development
// one, which closes an import cycle (platform-origins › environment › dev-bearer › dev-tokens ›
// session › platform-origins). The other order loads `dev-tokens` before `session` and breaks
// sixteen spec files with "Class extends value undefined".
import { routes } from './app.routes';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { WorkAcceptancePage } from './routes/projects/[slug]/work/acceptance/work-acceptance.page';
import { WorkArchivePage } from './routes/projects/[slug]/work/archive/work-archive.page';
import { WorkItemPage } from './routes/projects/[slug]/work/detail/[id]/work-item.page';
import { WorkInProgressPage } from './routes/projects/[slug]/work/in-progress/work-in-progress.page';
import { WorkRefinementPage } from './routes/projects/[slug]/work/refinement/work-refinement.page';
import { WorkLayout } from './routes/projects/[slug]/work/work.layout';
import { AgentChatPage } from './routes/projects/[slug]/agents/[agentId]/chat/agent-chat.page';
import { AgentFilesPage } from './routes/projects/[slug]/agents/[agentId]/files/agent-files.page';
import { AgentLayout } from './routes/projects/[slug]/agents/[agentId]/agent.layout';
import { AgentTerminalPage } from './routes/projects/[slug]/agents/[agentId]/terminal/agent-terminal.page';
import { ProjectAgentsPage } from './routes/projects/[slug]/agents/project-agents.page';
import { WorkAgentLayout } from './routes/projects/[slug]/work/detail/[id]/agent/work-agent.layout';
import { WorkspaceSlotPage } from './routes/projects/[slug]/workspaces/[slotId]/workspace-slot.page';
import { ProjectPickerPage } from './routes/projects/project-picker.page';

/** The work section's own routes, under the layout, without its session guard. */
const work = routes.find((route) => route.path === '')?.children ?? [];

/** Navigates to `url` and answers the components it renders, outermost first. */
async function opened(url: string): Promise<unknown[]> {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const components: unknown[] = [];
  for (let r = TestBed.inject(Router).routerState.snapshot.root.firstChild; r; r = r.firstChild) {
    components.push(r.component);
  }
  return components;
}

describe('work routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter(work),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    }),
  );

  it('opens In Progress at work', async () => {
    expect(await opened('/projects/qits/work')).toEqual([WorkLayout, WorkInProgressPage]);
    expect(TestBed.inject(Router).url).toBe('/projects/qits/work/in-progress');
  });

  it.each([
    ['refinement', WorkRefinementPage],
    ['in-progress', WorkInProgressPage],
    ['acceptance', WorkAcceptancePage],
    ['archive', WorkArchivePage],
  ])('opens work/%s in the work layout', async (tab, page) => {
    expect(await opened(`/projects/qits/work/${tab}`)).toEqual([WorkLayout, page]);
  });

  it('opens an item’s page at work/detail/<qualified id>, without the tabs', async () => {
    expect(await opened('/projects/qits/work/detail/qits-112')).toEqual([WorkItemPage]);
  });

  it('has no archive at work-archive any more: the catch-all answers it', async () => {
    expect(await opened('/projects/qits/work-archive')).toEqual([ProjectPickerPage]);
  });
});

describe('agents and workspaces routes', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideRouter(work),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
      ],
    }),
  );

  it('opens the project’s agents at agents', async () => {
    expect(await opened('/projects/x/agents')).toEqual([ProjectAgentsPage]);
  });

  it('redirects workspaces to agents', async () => {
    expect(await opened('/projects/x/workspaces')).toEqual([ProjectAgentsPage]);
    expect(TestBed.inject(Router).url).toBe('/projects/x/agents');
  });

  it('opens an agent at agents/<agent id>', async () => {
    expect((await opened('/projects/x/agents/a-1'))[0]).toBe(AgentLayout);
  });

  it.each([
    ['chat', AgentChatPage],
    ['files', AgentFilesPage],
    ['terminal', AgentTerminalPage],
  ])('opens its %s tab below it', async (tab, page) => {
    expect(await opened(`/projects/x/agents/a-1/${tab}`)).toEqual([AgentLayout, page]);
  });

  it.each(['', '/chat', '/files', '/terminal'])(
    'opens the item’s old agent address work/detail/<id>/agent%s on the redirect',
    async (tab) => {
      expect((await opened(`/projects/x/work/detail/x-1/agent${tab}`))[0]).toBe(WorkAgentLayout);
    },
  );

  it('opens a slot at workspaces/<slot id>', async () => {
    expect(await opened('/projects/x/workspaces/1')).toEqual([WorkspaceSlotPage]);
  });
});
