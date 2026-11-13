import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { LoadState } from '$ui/components/spinner/spinner';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { client as workspacesClient } from '../../../../../../../api/workspaces/client.gen';
import { provideHeyApiClient } from '../../../../../../../api/workspaces/client/client.gen';
import { WorkAgentLayout } from './work-agent.layout';

const settle = () => new Promise((resolve) => setTimeout(resolve));

const ITEM = 'qits-7';
const WORK_ID = 'w-7';
const AGENT_ID = '00000000-0000-4000-8000-0000000000a1';

/** The item's agents as `ITEM_AGENTS` reads them (`listAgents?workId=`), or a failed read. */
type ItemAnswer = { readonly agents: readonly { agentId: string; state: string }[] } | 'error';

/** The item's old agent address leads to its ACTIVE agent's page on the same tab, or to the item. */
describe('WorkAgentLayout', () => {
  let state: ReturnType<typeof signal<LoadState>>;
  let entries: ReturnType<typeof signal<readonly { id: string; qualifiedId: string }[]>>;
  let http: HttpTestingController;

  beforeEach(() => {
    state = signal<LoadState>('loading');
    entries = signal<readonly { id: string; qualifiedId: string }[]>([]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'projects/:slug/work/detail/:id/agent',
            component: WorkAgentLayout,
            children: [
              { path: '', children: [] },
              { path: ':tab', children: [] },
            ],
          },
          { path: 'projects/:slug/agents/:agentId', children: [{ path: '**', children: [] }] },
          { path: 'projects/:slug/work/detail/:id', children: [] },
        ]),
        { provide: SelectedProject, useValue: { slug: signal('qits') } },
        { provide: SelectedWork, useValue: { entries, state } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(workspacesClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return harness;
  }

  async function answer(read: ItemAnswer) {
    entries.set([{ id: WORK_ID, qualifiedId: ITEM }]);
    state.set('loaded');
    TestBed.tick();
    await settle();
    const request = http.expectOne(`/workspaces/api/agents?workId=${WORK_ID}`);
    if (read === 'error') request.flush(null, { status: 503, statusText: 'Unavailable' });
    else request.flush(read);
    await settle();
    TestBed.tick();
    await settle();
  }

  const ACTIVE = { agents: [{ agentId: AGENT_ID, state: 'ACTIVE' }] };

  it('goes to the item’s ACTIVE agent’s page, replacing the old address', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent`);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    await answer(ACTIVE);
    expect(navigate).toHaveBeenCalledWith(`/projects/qits/agents/${AGENT_ID}`, {
      replaceUrl: true,
    });
    await settle();
    expect(router.url).toBe(`/projects/qits/agents/${AGENT_ID}`);
  });

  it.each(['chat', 'files', 'terminal'])('keeps the %s tab', async (tab) => {
    await open(`/projects/qits/work/detail/${ITEM}/agent/${tab}`);
    await answer(ACTIVE);
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/agents/${AGENT_ID}/${tab}`);
  });

  it('drops a segment that is not a tab', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent/nope`);
    await answer(ACTIVE);
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/agents/${AGENT_ID}`);
  });

  it('goes to the item when it has no ACTIVE agent', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent/chat`);
    await answer({ agents: [{ agentId: AGENT_ID, state: 'OBSOLETE' }] });
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/work/detail/${ITEM}`);
  });

  it('goes to the item when the agents cannot be read', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent`);
    await answer('error');
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/work/detail/${ITEM}`);
  });

  it('goes to the item when the project’s work does not hold it', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent`);
    state.set('loaded');
    TestBed.tick();
    await settle();
    http.expectNone(() => true);
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/work/detail/${ITEM}`);
  });

  it('waits, reading nothing, while the work is loading', async () => {
    await open(`/projects/qits/work/detail/${ITEM}/agent`);
    TestBed.tick();
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/projects/qits/work/detail/${ITEM}/agent`);
  });
});
