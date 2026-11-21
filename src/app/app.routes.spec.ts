import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS, qitsAuthCallbackRoute } from '@qits/angular';
import { routes } from './app.routes';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
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
import { WorkCreatePage } from './routes/projects/[slug]/work/create/work-create.page';
import { ProjectIdeasPage } from './routes/projects/[slug]/ideas/project-ideas.page';
import { IdeaCreatePage } from './routes/projects/[slug]/ideas/create/idea-create.page';
import { IdeaPage } from './routes/projects/[slug]/ideas/detail/[ideaId]/idea.page';
import { IdeaEditPage } from './routes/projects/[slug]/ideas/detail/[ideaId]/edit/idea-edit.page';
import { ArtifactsRepositoryPage } from './routes/artifacts/repositories/[repo]/artifacts-repository.page';
import { ArtifactsImagePage } from './routes/artifacts/repositories/[repo]/images/[image]/artifacts-image.page';
import { ArtifactsMavenPackagePage } from './routes/artifacts/repositories/[repo]/maven-packages/[coordinate]/artifacts-maven-package.page';
import { ArtifactsCleanupPage } from './routes/artifacts/repositories/[repo]/cleanup/artifacts-cleanup.page';
import { ArtifactsDaemonPage } from './routes/artifacts/repositories/[repo]/daemons/[daemon]/artifacts-daemon.page';
import { ArtifactsDocsSitePage } from './routes/artifacts/repositories/[repo]/docs/[site]/artifacts-docs-site.page';
import { ArtifactsNpmPackagePage } from './routes/artifacts/repositories/[repo]/packages/[package]/artifacts-npm-package.page';
import { SwarmServicesPage } from './routes/system/swarm/services/swarm-services.page';
import { MirrorRepositoryPage } from './routes/mirror/repositories/[repository]/mirror-repository.page';
import { MirrorUpstreamsPage } from './routes/mirror/upstreams/mirror-upstreams.page';
import { OrchestratorProcessPage } from './routes/orchestrator/processes/[kind]/orchestrator-process.page';
import { SwarmServicePage } from './routes/system/swarm/services/[id]/swarm-service.page';
import { SwarmNodesPage } from './routes/system/swarm/nodes/swarm-nodes.page';
import { SwarmNodeLayout } from './routes/system/swarm/nodes/[id]/swarm-node.layout';
import { SwarmNodeVolumesPage } from './routes/system/swarm/nodes/[id]/volumes/swarm-node-volumes.page';
import { SwarmConfigsPage } from './routes/system/swarm/configs/swarm-configs.page';
import { SwarmSecretsPage } from './routes/system/swarm/secrets/swarm-secrets.page';
import { SystemTargetsPage } from './routes/system/targets/system-targets.page';

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
        // The work item page's resources follow the app's one stream (qits-2146).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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

  // Campaigns and milestones are retired (epic qits-1899): their old tabs are no route of the work
  // section, so they fall through to the catch-all, which is what any unknown address renders.
  it.each(['campaigns', 'milestones', 'milestones/00000000-0000-4000-8000-000000000002'])(
    'falls work/%s through to the catch-all',
    async (tab) => {
      expect(await opened(`/projects/qits/work/${tab}`)).toEqual([ProjectPickerPage]);
    },
  );

  it('opens an item’s page at work/detail/<qualified id>, without the tabs', async () => {
    expect(await opened('/projects/qits/work/detail/qits-112')).toEqual([WorkItemPage]);
  });

  it('opens the create form at work/create, without the tabs', async () => {
    expect(await opened('/projects/qits/work/create?archetype=EPIC')).toEqual([WorkCreatePage]);
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
        // The Agents page's resources follow the app's one stream, as `app.config.ts` provides it.
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
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

describe('ideas routes', () => {
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
        // The ideas pages' resources follow the app's one stream (qits-2146).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    }),
  );

  it.each([
    ['ideas', ProjectIdeasPage],
    ['ideas/create', IdeaCreatePage],
    ['ideas/detail/i-1', IdeaPage],
    ['ideas/detail/i-1/edit', IdeaEditPage],
  ])('opens %s', async (path, page) => {
    expect(await opened(`/projects/x/${path}`)).toEqual([page]);
  });
});

describe('artifacts routes (qits-2316)', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(work), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  /** The routed components below the section's parent, which has none of its own. */
  const pages = async (url: string) => (await opened(url)).filter(Boolean);

  it('opens a store repository at artifacts/repositories/<repo>', async () => {
    expect(await pages('/artifacts/repositories/npm')).toEqual([ArtifactsRepositoryPage]);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/npm');
  });

  it('opens an image at artifacts/repositories/<repo>/images/<image>, a slash as %2F (qits-2324)', async () => {
    expect(await pages('/artifacts/repositories/qits/images/team%2Fapp')).toEqual([
      ArtifactsImagePage,
    ]);
    const router = TestBed.inject(Router);
    let leaf = router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(leaf.paramMap.get('image')).toBe('team/app');
    expect(router.url).toBe('/artifacts/repositories/qits/images/team%2Fapp');
  });

  it('opens a maven coordinate at artifacts/repositories/<repo>/maven-packages/<coordinate> (qits-2325)', async () => {
    expect(
      await pages('/artifacts/repositories/maven/maven-packages/eu.wohlben.qits%3Acontract-maven'),
    ).toEqual([ArtifactsMavenPackagePage]);
    const router = TestBed.inject(Router);
    let leaf = router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(leaf.paramMap.get('coordinate')).toBe('eu.wohlben.qits:contract-maven');
  });

  it('opens a repository’s cleanup at artifacts/repositories/<repo>/cleanup (qits-2329)', async () => {
    expect(await pages('/artifacts/repositories/daemons/cleanup')).toEqual([ArtifactsCleanupPage]);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/daemons/cleanup');
  });

  it('opens a daemon at artifacts/repositories/<repo>/daemons/<daemon> (qits-2327)', async () => {
    expect(await pages('/artifacts/repositories/daemons/daemons/contract-daemon')).toEqual([
      ArtifactsDaemonPage,
    ]);
    const router = TestBed.inject(Router);
    let leaf = router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(leaf.paramMap.get('repo')).toBe('daemons');
    expect(leaf.paramMap.get('daemon')).toBe('contract-daemon');
  });

  it('opens a docs site at artifacts/repositories/<repo>/docs/<site>, the site one segment (qits-2328)', async () => {
    expect(await pages('/artifacts/repositories/docs/docs/%40changelog%2Fqits-qits')).toEqual([
      ArtifactsDocsSitePage,
    ]);
    const router = TestBed.inject(Router);
    // The router writes `@` literal in a segment (it needs no escape there); the `/` stays `%2F`.
    expect(router.url).toBe('/artifacts/repositories/docs/docs/@changelog%2Fqits-qits');
    let leaf = router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(leaf.paramMap.get('repo')).toBe('docs');
    expect(leaf.paramMap.get('site')).toBe('@changelog/qits-qits');
  });

  it('opens an npm package at artifacts/repositories/<repo>/packages/<package>, the name one segment (qits-2326)', async () => {
    expect(
      await pages('/artifacts/repositories/npm/packages/%40contract%2Fcontract-scoped'),
    ).toEqual([ArtifactsNpmPackagePage]);
    const router = TestBed.inject(Router);
    // The router writes `@` literal in a segment (it needs no escape there); the `/` stays `%2F`.
    expect(router.url).toBe('/artifacts/repositories/npm/packages/@contract%2Fcontract-scoped');
    let leaf = router.routerState.snapshot.root;
    while (leaf.firstChild) leaf = leaf.firstChild;
    expect(leaf.paramMap.get('repo')).toBe('npm');
    expect(leaf.paramMap.get('package')).toBe('@contract/contract-scoped');
  });

  it.each(['/artifacts', '/artifacts/repositories'])('opens the image store at %s', async (url) => {
    expect(await pages(url)).toEqual([ArtifactsRepositoryPage]);
    expect(TestBed.inject(Router).url).toBe('/artifacts/repositories/qits');
  });
});

describe('system routes (qits-2344)', () => {
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
        // The page's resource follows the app's one stream (its `refreshOn`).
        { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
      ],
    }),
  );

  /** The routed components below the section's parent, which has none of its own. */
  const pages = async (url: string) => (await opened(url)).filter(Boolean);

  it('opens the swarm services at system/swarm/services', async () => {
    expect(await pages('/system/swarm/services')).toEqual([SwarmServicesPage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/services');
  });

  it.each(['/system', '/system/swarm'])('opens the swarm services at %s', async (url) => {
    expect(await pages(url)).toEqual([SwarmServicesPage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/services');
  });

  it('opens one swarm service at system/swarm/services/:id (qits-2345)', async () => {
    expect(await pages('/system/swarm/services/dev-qits-artifacts')).toEqual([SwarmServicePage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/services/dev-qits-artifacts');
  });

  it('opens the swarm nodes at system/swarm/nodes (qits-2346)', async () => {
    expect(await pages('/system/swarm/nodes')).toEqual([SwarmNodesPage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/nodes');
  });

  it('opens one swarm node at system/swarm/nodes/:id (qits-2347)', async () => {
    expect(await pages('/system/swarm/nodes/iwbwrdui2z0n62kqcjfo1erwh')).toEqual([SwarmNodeLayout]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/nodes/iwbwrdui2z0n62kqcjfo1erwh');
  });

  it('opens a swarm node’s Volumes tab at system/swarm/nodes/:id/volumes (qits-2355)', async () => {
    expect(await pages('/system/swarm/nodes/iwbwrdui2z0n62kqcjfo1erwh/volumes')).toEqual([
      SwarmNodeLayout,
      SwarmNodeVolumesPage,
    ]);
    expect(TestBed.inject(Router).url).toBe(
      '/system/swarm/nodes/iwbwrdui2z0n62kqcjfo1erwh/volumes',
    );
  });

  it('opens the swarm configs at system/swarm/configs (qits-2348)', async () => {
    expect(await pages('/system/swarm/configs')).toEqual([SwarmConfigsPage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/configs');
  });

  it('opens the swarm secrets at system/swarm/secrets (qits-2350)', async () => {
    expect(await pages('/system/swarm/secrets')).toEqual([SwarmSecretsPage]);
    expect(TestBed.inject(Router).url).toBe('/system/swarm/secrets');
  });

  it('opens the execution targets at system/targets (qits-2351)', async () => {
    expect(await pages('/system/targets')).toEqual([SystemTargetsPage]);
    expect(TestBed.inject(Router).url).toBe('/system/targets');
  });
});

describe('mirror routes (qits-2357)', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(work), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  /** The routed components below the section's parent, which has none of its own. */
  const pages = async (url: string) => (await opened(url)).filter(Boolean);

  it('opens the OCI upstreams at mirror/upstreams', async () => {
    expect(await pages('/mirror/upstreams')).toEqual([MirrorUpstreamsPage]);
    expect(TestBed.inject(Router).url).toBe('/mirror/upstreams');
  });

  it('opens the OCI upstreams at mirror', async () => {
    expect(await pages('/mirror')).toEqual([MirrorUpstreamsPage]);
    expect(TestBed.inject(Router).url).toBe('/mirror/upstreams');
  });

  it('opens a cache root’s page at mirror/repositories/:repository (qits-2358)', async () => {
    expect(await pages('/mirror/repositories/hub')).toEqual([MirrorRepositoryPage]);
    expect(TestBed.inject(Router).url).toBe('/mirror/repositories/hub');
  });
});

describe('orchestrator routes (qits-2359)', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter(work), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  /** The routed components below the section's parent, which has none of its own. */
  const pages = async (url: string) => (await opened(url)).filter(Boolean);

  it('opens a process at orchestrator/processes/<kind>', async () => {
    expect(await pages('/orchestrator/processes/gc')).toEqual([OrchestratorProcessPage]);
    expect(TestBed.inject(Router).url).toBe('/orchestrator/processes/gc');
  });

  it('opens the gc process at orchestrator', async () => {
    expect(await pages('/orchestrator')).toEqual([OrchestratorProcessPage]);
    expect(TestBed.inject(Router).url).toBe('/orchestrator/processes/gc');
  });

  it('opens the gc process at orchestrator/processes', async () => {
    expect(await pages('/orchestrator/processes')).toEqual([OrchestratorProcessPage]);
    expect(TestBed.inject(Router).url).toBe('/orchestrator/processes/gc');
  });
});

describe('entry points (qits-2049)', () => {
  /** The full paths of the routes whose data marks them an entry, as `describeRoutes` reads it. */
  function entries(list: typeof routes, parent = ''): string[] {
    return list.flatMap((route) => {
      const own = [parent, route.path ?? ''].filter(Boolean).join('/');
      return [
        ...(route.data?.['qitsEntry'] === true ? [own] : []),
        ...entries(route.children ?? [], own),
      ];
    });
  }

  it('marks the front door, the old agent address, the docs reader’s split form, the System pages, the OCI upstreams, a cache root’s page and the orchestrator’s process, beside the library’s own', () => {
    // `qitsAuthCallbackRoute` is the library's to mark (its `auth/callback`), not this app's. The
    // reader's `read/**` is where the docs app's redirect lands (qits-2337); the swarm services,
    // nodes, configs and secrets, one service's page, one node's page, its Volumes tab and the
    // targets where qits-system-frontend's old pages hand off (qits-2344, qits-2345, qits-2346,
    // qits-2347, qits-2348, qits-2350, qits-2351, qits-2355), the OCI upstreams and a cache root's page where
    // qits-mirror-frontend's do (qits-2357, qits-2358), a process where qits-orchestrator-frontend's
    // `''` and `processes/:kind` do (qits-2359).
    expect(entries(routes).filter((path) => path !== qitsAuthCallbackRoute.path)).toEqual([
      '',
      'projects/:slug/work/detail/:id/agent/:tab',
      'projects/:slug/docs/read/**',
      'system/swarm/services/:id',
      'system/swarm/services',
      'system/swarm/nodes',
      'system/swarm/nodes/:id',
      'system/swarm/nodes/:id/volumes',
      'system/swarm/configs',
      'system/swarm/secrets',
      'system/targets',
      'mirror/upstreams',
      'mirror/repositories/:repository',
      'orchestrator/processes/:kind',
    ]);
  });
});
