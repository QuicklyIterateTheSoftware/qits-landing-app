import { Routes } from '@angular/router';
import { qitsAuthCallbackRoute, qitsSignedInGuard } from '@qits/angular';

/**
 * Routes live on the filesystem: `routes/` mirrors the URL. A route's full path (its parents'
 * paths joined, `''` skipped, `:param` as `[param]`) is the directory of its component's file
 * under `routes/`, so `projects/:slug/work` renders `routes/projects/[slug]/work/*.page.ts`. A
 * routed component is a page (`<name>.page.ts`, class `<Name>Page`), or a layout when it has
 * children (`<name>.layout.ts`, class `<Name>Layout`). A layout shared by many routes, such as
 * the shell, lives in `layout/` (the `$layout` alias) instead. Components that are not routed live
 * in `layout/`, `patterns/` and `ui/components/`. The `@qits/angular` lint rules `qits/page-location`,
 * `qits/page-suffix` and `qits/route-matches-directory` check this.
 *
 * Every route loads its component lazily (`loadComponent`), so no page is in the initial bundle
 * and each page is a chunk of its own.
 *
 * The root hands on to `projects` (`RootPage`, see there why not `redirectTo`), the project
 * list is at `projects`, one project's page at `projects/<slug>`, and a catch-all that is
 * load-bearing rather than tidy.
 *
 * `.config/qits/deployments.yml` declares `routes: /landing`, which is the prefix the edge
 * path-routes on EVERY vhost — so this application is asked for `/landing` as well as for `/` on
 * its own host. The catch-all is what makes both spellings RENDER the page.
 *
 * IT RENDERS AND MUST NOT REDIRECT. `{ path: '**', redirectTo: '' }` was the first shape and it is
 * wrong here, measured: it answers `/landing` with a 302 to `/`, and on a foreign vhost — which is
 * exactly where the `/landing` prefix is reached from — `/` is somebody else's application. The
 * browser would be sent from the landing page to qits-ci's SPA. Rendering the component leaves the
 * URL alone.
 *
 * It also makes this application indifferent to whether the edge forwards the prefix verbatim or
 * strips it, which is one fewer thing that has to be true for the front door to work.
 *
 * `ShellLayout` is the root route component, so the chrome survives navigation and only the outlet
 * beneath it changes. `qitsSignedInGuard` sends a visitor who holds no token to sign in (`@qits/angular`'s
 * bearer sign-in, `app.config.ts`), back to the page they asked for.
 *
 * The work section: `projects/<slug>/work` is `WorkLayout`, a row of tabs over its pages
 * (`refinement`, `schedule`, `in-progress`, `acceptance`, `archive`). An item's page is at
 * `work/detail/<qualified id>`, so an id can never be taken for a tab; it sits outside the layout,
 * with no tabs. `/work` opens `in-progress` by a `redirectTo`, not a page as at the root: the
 * redirect happens before the URL is written, so `/work` never enters the history and Back has
 * nothing to bounce on, and the server answers `/work` with a 302 instead of rendering an empty
 * page.
 *
 * A new epic or ticket is filed at `work/create` (`WorkCreatePage`, epic qits-888), its
 * query filling the form (an idea's Create epic / Create ticket names the idea as `inspiredBy`).
 *
 * A project's ideas (epic qits-888) are at `projects/<slug>/ideas` (`ProjectIdeasPage`), a new one
 * at `ideas/create` (`IdeaCreatePage`), one idea at `ideas/detail/<idea id>` (`IdeaPage`, in the
 * work section's `detail` scheme so an id can never be taken for `create`) and its edit at
 * `ideas/detail/<idea id>/edit` (`IdeaEditPage`).
 *
 * A project's release requests are at `projects/<slug>/release-requests` (`ReleaseRequestsPage`),
 * one request at `release-requests/<requestId>` (`ReleaseRequestPage`).
 *
 * One CI run is at `projects/<slug>/ci/runs/<runId>` (`CiRunPage`, qits-2321), declared ahead of
 * every other CI page: its header and facts, its steps with their coloured output (`?step=`),
 * Cancel and Run again, and its reports.
 *
 * A project's CI is at `projects/<slug>/ci` (`CiRunsPage`, qits-2314): each repository's newest
 * run and newest run on main, filtered by `?repository=` and `?status=`, with the project's
 * running and queued runs above them. One repository's runs are at `ci/<repository name>`
 * (`CiRepositoryRunsPage`, qits-2320), newest first, filtered by `?status=`, `?branch=` and
 * `?trigger=`; the run page is one segment deeper (`ci/runs/<runId>`), declared first so its
 * `runs` segment is never taken for a repository's name.
 *
 * A project's delivery desk trigger messages are at `projects/<slug>/desk` (`ProjectDeskPage`,
 * epic qits-1604).
 *
 * A project's docs are at `projects/<slug>/docs` (`ProjectDocsPage`, qits-2318): every site of
 * qits-artifacts' docs store, by section, narrowed by `?section=` and `?q=`. One repository's are at
 * `docs/repositories/<repository name>` (`RepositoryDocsPage`, qits-2336): the sites whose newest
 * version it published, narrowed by `?section=`. The fixed `repositories` segment keeps a
 * repository's name from ever meaning a reader path under `docs/`; the sidebar keeps Docs
 * current below it. One site is read at `docs/read/<site>[/-/<version>]` (`DocsReaderPage`,
 * qits-2337): the site spans segments, so `read/:site` and `read/:site/-/:version` (this app's
 * links, the site one segment) and `read/**` (the docs app's redirect, the site split) all render
 * it, and it parses the site and the version off the URL. The page lives in `read/[site]/`, the
 * route its outcomes are declared for.
 *
 * A project's events are at `projects/<slug>/events` (`ProjectEventsPage`, qits-2312), one event
 * at `events/<event id>` (`ProjectEventPage`, qits-2338): its facts, its payload and its chain,
 * a detail page with no sidebar entry of its own.
 *
 * The Observability section (qits-2313): `projects/<slug>/observability` is a parent with no
 * component, its pages its children; `/observability` opens `logs` (`ObservabilityLogsPage`, the
 * telemetry buffer's log lines of one source) by a relative `redirectTo`, which keeps the query, so
 * `/observability?source=_service/qits-ci` lands on that source's logs. `errors`
 * (`ObservabilityErrorsPage`, qits-2339) is one source's error spans and logs, grouped by trace;
 * `metrics` (`ObservabilityMetricsPage`, qits-2340) the latest value of each of its metric series;
 * `slow-spans` (`ObservabilitySlowSpansPage`, qits-2341) its spans at or above a duration floor;
 * `traces` (`ObservabilityTracesPage`, qits-2342) its traces, grouped by path.
 * `traces/<traceId>` (`ObservabilityTracePage`, qits-2343, `?source=`) one of its traces as a
 * waterfall, reached from a trace id on the Slow spans and Errors pages.
 *
 * The Deployments section (qits-2315): `projects/<slug>/deployments` is a parent with no
 * component, like Observability; `/deployments` opens `requests` (`DeploymentRequestsPage`, the
 * project's deployment requests, pending and completed) by a relative `redirectTo`.
 * `requests/by-release/<repoId>/<version>` (`DeploymentRequestsByReleasePage`, qits-2323) is the
 * requests one release produced, its variants' included: one opens its page in its place, several
 * are a table, none says why. It is declared before `requests/<requestId>`
 * (`DeploymentRequestPage`, qits-2322, one request); the sidebar keeps Requests current below both.
 *
 * The Maintenance section (qits-2317): `projects/<slug>/maintenance` is a parent with no
 * component, its pages its children; `/maintenance` opens `dependencies`
 * (`MaintenanceDependenciesPage`, the project's internal and external pins, the behind ones first)
 * by a relative `redirectTo`, which keeps the query, so `/maintenance?behind=true` lands on the
 * behind pins only.
 * `maintenance/artifacts` (`MaintenanceArtifactsPage`, qits-2330) is what the project has
 * released and who still ships an old copy: the listing, and one artifact's dependents at
 * `?ecosystem=&name=` on the same page. It is not the global `/artifacts` (the artifact store,
 * qits-2316). `maintenance/bumps/<bumpId>` (`MaintenanceBumpPage`, qits-2332) is one bump,
 * `maintenance/adoption/<repository>/<version>` (`MaintenanceAdoptionPage`, qits-2333) how far
 * one release got, and `maintenance/repositories/<name>` (`MaintenanceRepositoryPage`, qits-2334)
 * one repository's pins, bumps, dependents and downstream: detail pages with no sidebar entry of
 * their own.
 *
 * The agents (epic qits-1681, before it epic qits-1230's workspaces): `projects/<slug>/agents`
 * lists the project's ACTIVE agents and, under a Workspaces heading, its slots
 * (`ProjectAgentsPage`); `agents/<agent id>` is one agent (`AgentLayout`): a layout, whose
 * children are the agent's tabs (`chat`, `AgentChatPage`; `files`, `AgentFilesPage`; `terminal`,
 * `AgentTerminalPage`), with an empty default. `workspaces/<slot id>` is one slot
 * (`WorkspaceSlotPage`); the bare `workspaces` redirects to `agents`. A work item's old agent
 * address, `work/detail/<qualified id>/agent[/<tab>]`, where the Workspace links on cards and on the
 * item's page still lead, is `WorkAgentLayout`: it finds the item's ACTIVE agent and goes to its
 * page on the same tab, or to the item. This app has no runners page of its own (epic qits-1481):
 * the execution targets a slot is placed on are qits-system's, listed on the System section's
 * Targets page (`system/targets`, qits-2351), which the Agents page's Targets link opens.
 *
 * The Network access pane (epic qits-1977) is no route of this app any more (qits-2361): it is
 * qits-network-access' own frontend at `https://network-access.<domain>/`, which the shell links to.
 *
 * The Artifacts section (qits-2316) is at `artifacts/repositories/<repo>` (`ArtifactsRepositoryPage`):
 * one of qits-artifacts' store repositories (`qits`, `npm`, `maven`, …), reached from the root
 * sidebar with no project open, as nothing in the store joins to a project. `artifacts` and
 * `artifacts/repositories` redirect to `artifacts/repositories/qits`, the image store, by a
 * relative `redirectTo`.
 * `artifacts/repositories/<repo>/images/<image>` (`ArtifactsImagePage`, qits-2324) is one image of
 * an image store, its tags and manifests; the image name is one segment (`%2F` for a slash).
 * `artifacts/repositories/<repo>/cleanup` (`ArtifactsCleanupPage`, qits-2329) is one repository's
 * cleanup: its gc plan read through qits-orchestrator, and the Run that sweeps it.
 * `artifacts/repositories/<repo>/daemons/<daemon>` (`ArtifactsDaemonPage`, qits-2327) is one daemon
 * of a daemon store, its published versions, each one downloadable.
 * `artifacts/repositories/<repo>/maven-packages/<coordinate>` (`ArtifactsMavenPackagePage`,
 * qits-2325) is one maven coordinate, its versions and their SBOMs; `groupId:artifactId` is one
 * segment.
 * `artifacts/repositories/<repo>/docs/<site>` (`ArtifactsDocsSitePage`, qits-2328) is one docs site
 * of a docs store, its published versions, each read in qits-docs' reader; the site name is one
 * segment (`@changelog/qits-qits` is `@changelog%2Fqits-qits` in the URL).
 * `artifacts/repositories/<repo>/packages/<package>` (`ArtifactsNpmPackagePage`, qits-2326) is one
 * npm package of an npm store, its versions with their dist-tags and their SBOMs; the package name
 * is one segment (`@qits/angular` is `@qits%2Fangular` in the URL). With it every store listing's
 * rows open a page of this app; none leaves for qits-artifacts-frontend any more.
 *
 * The System section (qits-2344) is at `system/swarm/services` (`SwarmServicesPage`): the services
 * of the one swarm qits-system runs on, with a state derived from their replicas, reached from the
 * root sidebar with no project open. `system` and `system/swarm` redirect to it by a relative
 * `redirectTo`; it is an entry point, where qits-system-frontend's old `swarm/services` hands off.
 * `system/swarm/nodes` (`SwarmNodesPage`, qits-2346) is the same swarm's nodes, an entry point too,
 * where the old `swarm/nodes` hands off. `system/swarm/configs` (`SwarmConfigsPage`, qits-2348) is
 * its configs, with their labels and docker's own created/updated text, an entry point too, where
 * the old `swarm/configs` hands off. `system/swarm/secrets` (`SwarmSecretsPage`, qits-2350) is
 * its secrets, never a value, each with the services whose spec references it, an entry point too,
 * where the old `swarm/secrets` hands off. `system/targets` (`SystemTargetsPage`, qits-2351) is
 * qits-system's execution targets, each with its slots, sign-ins, health and leases, and the
 * writes that declare, edit, commission and delete them; an entry point too, where the old
 * `targets` hands off. Below the root sidebar's System, its pages are listed while the section is
 * open (Services, Nodes, Configs, Secrets, Targets); qits-2345…qits-2356 add the section's other
 * pages under `system/...`, qits-2347…qits-2356 each with its own entry there.
 * `system/swarm/services/<id>` (`SwarmServicePage`, qits-2345) is one service of that swarm, by
 * its name or id: its facts, rollout, environment keys, labels, mounts, networks and tasks; each
 * services row's name opens it, and it is an entry point too, where the old `swarm/services/:id`
 * hands off.
 * `system/swarm/nodes/<id>` (`SwarmNodeLayout`, qits-2347) is one node of that swarm, by its id:
 * its status, availability and manager status, facts, labels and the tasks swarm placed on it; each
 * nodes row's hostname opens it, the sidebar keeps Nodes current on it, and it is an entry point
 * too, where the old `swarm/nodes/:id` hands off. It is a layout (qits-2354): its four resource
 * tabs (`NODE_TABS`: containers, images, volumes, networks) come as its child routes
 * (qits-2352…qits-2355); the bare URL shows the node alone, with no redirect to a tab.
 * `system/swarm/nodes/<id>/containers` (`SwarmNodeContainersPage`, qits-2352) is its first tab:
 * the containers of the node qits-system runs on (none read for another node), Running by default,
 * with each one's log tail; an entry point, where the old `swarm/nodes/:id/containers` hands off.
 * `system/swarm/nodes/<id>/images` (`SwarmNodeImagesPage`, qits-2353) is that node's Images tab:
 * the images the node holds (local to the node qits-system runs on; another node shows a note and
 * is not read), with the containers using each and their total size; an entry point too, where the
 * old `swarm/nodes/:id/images` hands off.
 * `system/swarm/nodes/<id>/volumes` (`SwarmNodeVolumesPage`, qits-2355) is the node's Volumes tab:
 * the volumes of the node qits-system runs on, the unused ones marked, the anonymous ones hidden
 * unless `?anonymous=1`; an entry point too, where the old node volumes tab hands off.
 * `system/swarm/nodes/<id>/networks` (`SwarmNodeNetworksPage`, qits-2354) is the node's Networks
 * tab: the docker networks of the node qits-system runs on (another node is not read), an entry
 * point too, where the old `swarm/nodes/:id/networks` hands off.
 * `system/swarm/configs/<id>` (`SwarmConfigPage`, qits-2349) is one config of that swarm, by its
 * id or name: its id, exact created and updated instants, labels and its data verbatim (a note
 * for a binary or an empty config); each configs row's name opens it, the sidebar keeps Configs
 * current on it, and it is an entry point too, where the old `swarm/configs/:id` hands off.
 *
 * The Mirror section (qits-2357) is at `mirror/upstreams` (`MirrorUpstreamsPage`): the image
 * registries qits-mirror's pull-through cache fronts, reached from the root sidebar with no project
 * open. `mirror` redirects to it by a relative `redirectTo`; it is an entry point, where
 * qits-mirror-frontend's old `upstreams` hands off. One cache root's contents are at
 * `mirror/repositories/:repository` (`MirrorRepositoryPage`, qits-2358), an entry point too, where
 * the old `repositories/:repository` hands off; qits-2471 adds the list at `mirror/repositories`.
 *
 * The Orchestrator section (qits-2359) is at `orchestrator/processes/<kind>`
 * (`OrchestratorProcessPage`): one of qits-orchestrator's technical processes, its latest runs,
 * one run's steps by dependency depth and one step's call, reached from the root sidebar with no
 * project open. The shown run and the open step are the query (`?run=`, `?step=`), so a run is an
 * address. `orchestrator` and `orchestrator/processes` redirect to `processes/gc` (the only
 * process); it is an entry point, where qits-orchestrator-frontend's old `''` and `processes/:kind`
 * hand off.
 *
 * `auth/callback` is where the sign-in comes back to (`@qits/angular`'s `qitsAuthCallbackRoute`, the
 * one callback page: `app.config.ts` passes `callbackRoute: false`); it sits first and outside the
 * shell, so the guard does not run on it and the catch-all never takes it.
 */
export const routes: Routes = [
  qitsAuthCallbackRoute,
  {
    path: '',
    loadComponent: () => import('$layout/shell/shell.layout').then((m) => m.ShellLayout),
    canActivate: [qitsSignedInGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./routes/root.page').then((m) => m.RootPage),
        // An entry point (qits-2049): the app's front door, entered from outside whatever leads here.
        data: { qitsEntry: true },
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./routes/projects/project-picker.page').then((m) => m.ProjectPickerPage),
      },
      {
        path: 'projects/:slug',
        loadComponent: () =>
          import('./routes/projects/[slug]/project.page').then((m) => m.ProjectPage),
      },
      {
        path: 'projects/:slug/work/detail/:id',
        loadComponent: () =>
          import('./routes/projects/[slug]/work/detail/[id]/work-item.page').then(
            (m) => m.WorkItemPage,
          ),
      },
      {
        // The item's old agent address: leads to its ACTIVE agent's page, on the same tab.
        path: 'projects/:slug/work/detail/:id/agent',
        loadComponent: () =>
          import('./routes/projects/[slug]/work/detail/[id]/agent/work-agent.layout').then(
            (m) => m.WorkAgentLayout,
          ),
        children: [
          { path: '', children: [] },
          {
            path: ':tab',
            children: [],
            // An entry point (qits-2049): the old address qits-projects-frontend's `agentAddress`
            // and bookmarks still link; no outcome of this app leads here.
            data: { qitsEntry: true },
          },
        ],
      },
      {
        // Outside the layout like an item's page, and before it, so `create` is never a tab.
        path: 'projects/:slug/work/create',
        loadComponent: () =>
          import('./routes/projects/[slug]/work/create/work-create.page').then(
            (m) => m.WorkCreatePage,
          ),
      },
      {
        path: 'projects/:slug/ideas',
        loadComponent: () =>
          import('./routes/projects/[slug]/ideas/project-ideas.page').then(
            (m) => m.ProjectIdeasPage,
          ),
      },
      {
        path: 'projects/:slug/ideas/create',
        loadComponent: () =>
          import('./routes/projects/[slug]/ideas/create/idea-create.page').then(
            (m) => m.IdeaCreatePage,
          ),
      },
      {
        path: 'projects/:slug/ideas/detail/:ideaId',
        loadComponent: () =>
          import('./routes/projects/[slug]/ideas/detail/[ideaId]/idea.page').then(
            (m) => m.IdeaPage,
          ),
      },
      {
        path: 'projects/:slug/ideas/detail/:ideaId/edit',
        loadComponent: () =>
          import('./routes/projects/[slug]/ideas/detail/[ideaId]/edit/idea-edit.page').then(
            (m) => m.IdeaEditPage,
          ),
      },
      {
        path: 'projects/:slug/work',
        loadComponent: () =>
          import('./routes/projects/[slug]/work/work.layout').then((m) => m.WorkLayout),
        children: [
          // A redirect, not a page like the root's `RootPage`: see "The work section" above.
          { path: '', pathMatch: 'full', redirectTo: 'in-progress' },
          {
            path: 'refinement',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/refinement/work-refinement.page').then(
                (m) => m.WorkRefinementPage,
              ),
          },
          {
            path: 'schedule',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/schedule/work-schedule.page').then(
                (m) => m.WorkSchedulePage,
              ),
          },
          {
            path: 'in-progress',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/in-progress/work-in-progress.page').then(
                (m) => m.WorkInProgressPage,
              ),
          },
          {
            path: 'acceptance',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/acceptance/work-acceptance.page').then(
                (m) => m.WorkAcceptancePage,
              ),
          },
          {
            path: 'archive',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/archive/work-archive.page').then(
                (m) => m.WorkArchivePage,
              ),
          },
        ],
      },
      {
        path: 'projects/:slug/agents',
        loadComponent: () =>
          import('./routes/projects/[slug]/agents/project-agents.page').then(
            (m) => m.ProjectAgentsPage,
          ),
      },
      {
        path: 'projects/:slug/agents/:agentId',
        loadComponent: () =>
          import('./routes/projects/[slug]/agents/[agentId]/agent.layout').then(
            (m) => m.AgentLayout,
          ),
        // The agent's tabs (`AGENT_TABS`); the bare URL shows the agent alone.
        children: [
          { path: '', children: [] },
          {
            path: 'chat',
            loadComponent: () =>
              import('./routes/projects/[slug]/agents/[agentId]/chat/agent-chat.page').then(
                (m) => m.AgentChatPage,
              ),
          },
          {
            path: 'files',
            loadComponent: () =>
              import('./routes/projects/[slug]/agents/[agentId]/files/agent-files.page').then(
                (m) => m.AgentFilesPage,
              ),
          },
          {
            path: 'terminal',
            loadComponent: () =>
              import('./routes/projects/[slug]/agents/[agentId]/terminal/agent-terminal.page').then(
                (m) => m.AgentTerminalPage,
              ),
          },
        ],
      },
      // The section was Workspaces before epic qits-1681; its slots are now on the Agents page.
      { path: 'projects/:slug/workspaces', pathMatch: 'full', redirectTo: 'projects/:slug/agents' },
      {
        path: 'projects/:slug/workspaces/:slotId',
        loadComponent: () =>
          import('./routes/projects/[slug]/workspaces/[slotId]/workspace-slot.page').then(
            (m) => m.WorkspaceSlotPage,
          ),
      },
      {
        path: 'projects/:slug/release-requests',
        loadComponent: () =>
          import('./routes/projects/[slug]/release-requests/release-requests.page').then(
            (m) => m.ReleaseRequestsPage,
          ),
      },
      {
        path: 'projects/:slug/release-requests/:requestId',
        loadComponent: () =>
          import('./routes/projects/[slug]/release-requests/[requestId]/release-request.page').then(
            (m) => m.ReleaseRequestPage,
          ),
      },
      {
        path: 'projects/:slug/ci/runs/:runId',
        loadComponent: () =>
          import('./routes/projects/[slug]/ci/runs/[runId]/ci-run.page').then((m) => m.CiRunPage),
      },
      {
        path: 'projects/:slug/ci',
        loadComponent: () =>
          import('./routes/projects/[slug]/ci/ci-runs.page').then((m) => m.CiRunsPage),
      },
      {
        path: 'projects/:slug/ci/:repo',
        loadComponent: () =>
          import('./routes/projects/[slug]/ci/[repo]/ci-repository-runs.page').then(
            (m) => m.CiRepositoryRunsPage,
          ),
      },
      {
        path: 'projects/:slug/desk',
        loadComponent: () =>
          import('./routes/projects/[slug]/desk/project-desk.page').then((m) => m.ProjectDeskPage),
      },
      {
        path: 'projects/:slug/repositories',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/project-repositories.page').then(
            (m) => m.ProjectRepositoriesPage,
          ),
      },
      {
        path: 'projects/:slug/repositories/:repo/ui-builder',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/[repo]/ui-builder/ui-builder.page').then(
            (m) => m.UiBuilderPage,
          ),
      },
      {
        path: 'projects/:slug/repositories/:repo/contracts',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/[repo]/contracts/contracts.page').then(
            (m) => m.ContractsPage,
          ),
      },
      {
        path: 'projects/:slug/repositories/:repo/contracts/:state',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/[repo]/contracts/[state]/contract-state.page').then(
            (m) => m.ContractStatePage,
          ),
      },
      {
        path: 'projects/:slug/repositories/:repo/entities',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/[repo]/entities/entities.page').then(
            (m) => m.EntitiesPage,
          ),
      },
      {
        path: 'projects/:slug/repositories/:repo/entities/:entity',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/[repo]/entities/[entity]/entity.page').then(
            (m) => m.EntityPage,
          ),
      },
      {
        // The Deployments section (qits-2315): no layout of its own, one page per view.
        path: 'projects/:slug/deployments',
        children: [
          // Relative, as the Observability section's: see "The Deployments section".
          { path: '', pathMatch: 'full', redirectTo: 'requests' },
          {
            path: 'requests',
            loadComponent: () =>
              import('./routes/projects/[slug]/deployments/requests/deployment-requests.page').then(
                (m) => m.DeploymentRequestsPage,
              ),
          },
          {
            // One release's requests (qits-2323), before `requests/:requestId`.
            path: 'requests/by-release/:repoId/:version',
            loadComponent: () =>
              import('./routes/projects/[slug]/deployments/requests/by-release/[repoId]/[version]/deployment-requests-by-release.page').then(
                (m) => m.DeploymentRequestsByReleasePage,
              ),
          },
          {
            // One request (qits-2322); the sidebar keeps Requests current below it.
            path: 'requests/:requestId',
            loadComponent: () =>
              import('./routes/projects/[slug]/deployments/requests/[requestId]/deployment-request.page').then(
                (m) => m.DeploymentRequestPage,
              ),
          },
        ],
      },
      {
        // The Observability section (qits-2313): no layout of its own, one page per view.
        path: 'projects/:slug/observability',
        children: [
          // Relative, so the query (`?source=…`) rides along: see "The Observability section".
          { path: '', pathMatch: 'full', redirectTo: 'logs' },
          {
            path: 'logs',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/logs/observability-logs.page').then(
                (m) => m.ObservabilityLogsPage,
              ),
          },
          {
            path: 'errors',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/errors/observability-errors.page').then(
                (m) => m.ObservabilityErrorsPage,
              ),
          },
          {
            path: 'metrics',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/metrics/observability-metrics.page').then(
                (m) => m.ObservabilityMetricsPage,
              ),
          },
          {
            path: 'slow-spans',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/slow-spans/observability-slow-spans.page').then(
                (m) => m.ObservabilitySlowSpansPage,
              ),
          },
          {
            path: 'traces',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/traces/observability-traces.page').then(
                (m) => m.ObservabilityTracesPage,
              ),
          },
          {
            // One trace of a source (qits-2343), a detail page: the sidebar keeps Observability.
            path: 'traces/:traceId',
            loadComponent: () =>
              import('./routes/projects/[slug]/observability/traces/[traceId]/observability-trace.page').then(
                (m) => m.ObservabilityTracePage,
              ),
          },
        ],
      },
      {
        path: 'projects/:slug/docs',
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/project-docs.page').then((m) => m.ProjectDocsPage),
      },
      {
        path: 'projects/:slug/docs/repositories/:repo',
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/repositories/[repo]/repository-docs.page').then(
            (m) => m.RepositoryDocsPage,
          ),
      },
      // The docs reader (qits-2337): one page under three addresses. This app's links name the site
      // as one segment (`read/:site[/-/:version]`, the site's `/` escaped), which an exit can carry;
      // `read/**` takes the same addresses with the site split over segments, as the docs app's
      // redirect writes them (an entry from outside the app). The page reads the site and the
      // version off the URL either way (`parseReadPath`), so all three load it from `read/[site]/`.
      {
        path: 'projects/:slug/docs/read/:site',
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/read/[site]/docs-reader.page').then(
            (m) => m.DocsReaderPage,
          ),
      },
      {
        path: 'projects/:slug/docs/read/:site/-/:version',
        // eslint-disable-next-line qits/route-matches-directory -- the version is read off the URL by the site's page
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/read/[site]/docs-reader.page').then(
            (m) => m.DocsReaderPage,
          ),
      },
      {
        path: 'projects/:slug/docs/read/**',
        data: { qitsEntry: true },
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/read/[site]/docs-reader.page').then(
            (m) => m.DocsReaderPage,
          ),
      },
      {
        path: 'projects/:slug/events',
        loadComponent: () =>
          import('./routes/projects/[slug]/events/project-events.page').then(
            (m) => m.ProjectEventsPage,
          ),
      },
      {
        // One event (qits-2338), a detail page of the Events section.
        path: 'projects/:slug/events/:id',
        loadComponent: () =>
          import('./routes/projects/[slug]/events/[id]/project-event.page').then(
            (m) => m.ProjectEventPage,
          ),
      },
      {
        // The Maintenance section (qits-2317): no layout of its own, one page per view.
        path: 'projects/:slug/maintenance',
        children: [
          // Relative, so the query (`?behind=true`) rides along: see "The Maintenance section".
          { path: '', pathMatch: 'full', redirectTo: 'dependencies' },
          {
            path: 'dependencies',
            loadComponent: () =>
              import('./routes/projects/[slug]/maintenance/dependencies/maintenance-dependencies.page').then(
                (m) => m.MaintenanceDependenciesPage,
              ),
          },
          {
            path: 'artifacts',
            loadComponent: () =>
              import('./routes/projects/[slug]/maintenance/artifacts/maintenance-artifacts.page').then(
                (m) => m.MaintenanceArtifactsPage,
              ),
          },
          {
            // A detail page (qits-2332): no sidebar entry; the sidebar keeps Maintenance open.
            path: 'bumps/:bumpId',
            loadComponent: () =>
              import('./routes/projects/[slug]/maintenance/bumps/[bumpId]/maintenance-bump.page').then(
                (m) => m.MaintenanceBumpPage,
              ),
          },
          {
            // A detail page (qits-2334): no sidebar entry; the sidebar keeps Maintenance open.
            path: 'repositories/:name',
            loadComponent: () =>
              import('./routes/projects/[slug]/maintenance/repositories/[name]/maintenance-repository.page').then(
                (m) => m.MaintenanceRepositoryPage,
              ),
          },
          {
            // A detail page (qits-2333): no sidebar entry; the sidebar keeps Maintenance open.
            path: 'adoption/:repository/:version',
            loadComponent: () =>
              import('./routes/projects/[slug]/maintenance/adoption/[repository]/[version]/maintenance-adoption.page').then(
                (m) => m.MaintenanceAdoptionPage,
              ),
          },
        ],
      },
      {
        path: 'projects/:slug/setup',
        loadComponent: () =>
          import('./routes/projects/[slug]/setup/project-setup.page').then(
            (m) => m.ProjectSetupPage,
          ),
      },
      {
        // The Artifacts section (qits-2316): qits-artifacts' store, bound to no project. No front
        // page of its own yet: `/artifacts` and `/artifacts/repositories` open the image store.
        path: 'artifacts',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'repositories/qits' },
          { path: 'repositories', pathMatch: 'full', redirectTo: 'repositories/qits' },
          {
            path: 'repositories/:repo',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/artifacts-repository.page').then(
                (m) => m.ArtifactsRepositoryPage,
              ),
          },
          {
            // One image of an image store (qits-2324): its tags and manifests. `:image` is one
            // segment; a slashed name rides as %2F, which the router decodes into the param.
            path: 'repositories/:repo/images/:image',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/images/[image]/artifacts-image.page').then(
                (m) => m.ArtifactsImagePage,
              ),
          },
          {
            // One repository's cleanup (qits-2329): its gc plan through qits-orchestrator, and Run.
            path: 'repositories/:repo/cleanup',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/cleanup/artifacts-cleanup.page').then(
                (m) => m.ArtifactsCleanupPage,
              ),
          },
          {
            // One daemon of a daemon store (qits-2327): its published versions. A daemon name is
            // bounded to [a-z0-9][a-z0-9._-]{0,63} by the wire, so it is always one plain segment.
            path: 'repositories/:repo/daemons/:daemon',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/daemons/[daemon]/artifacts-daemon.page').then(
                (m) => m.ArtifactsDaemonPage,
              ),
          },
          {
            // One maven coordinate of a maven store (qits-2325): its versions and their SBOMs.
            // `:coordinate` is one segment, `groupId:artifactId`.
            path: 'repositories/:repo/maven-packages/:coordinate',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/maven-packages/[coordinate]/artifacts-maven-package.page').then(
                (m) => m.ArtifactsMavenPackagePage,
              ),
          },
          {
            // One docs site of a docs store (qits-2328): its published versions. Every site name
            // is scoped and slashed (`@changelog/qits-qits`), so it is one segment, `%2F` encoded.
            path: 'repositories/:repo/docs/:site',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/docs/[site]/artifacts-docs-site.page').then(
                (m) => m.ArtifactsDocsSitePage,
              ),
          },
          {
            // One npm package of an npm store (qits-2326): its versions and their SBOMs.
            // `:package` is one segment; a scoped name's slash rides as %2F, which the router
            // decodes into the param (`@qits/angular`).
            path: 'repositories/:repo/packages/:package',
            loadComponent: () =>
              import('./routes/artifacts/repositories/[repo]/packages/[package]/artifacts-npm-package.page').then(
                (m) => m.ArtifactsNpmPackagePage,
              ),
          },
        ],
      },
      {
        // The System section (qits-2344): qits-system's one swarm, bound to no project. No front
        // page of its own yet: `/system` and `/system/swarm` open the swarm's services.
        path: 'system',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'swarm/services' },
          { path: 'swarm', pathMatch: 'full', redirectTo: 'swarm/services' },
          {
            path: 'swarm/services/:id',
            // An entry point (qits-2049): qits-system-frontend's old `swarm/services/:id` hands
            // off here with a full-document load (qits-2345); the services list links it too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/services/[id]/swarm-service.page').then(
                (m) => m.SwarmServicePage,
              ),
          },
          {
            path: 'swarm/services',
            // An entry point (qits-2049): qits-system-frontend's old `swarm/services` hands off
            // here with a full-document load, and its bookmarks follow; the sidebar's System
            // leads to `system`, which redirects here, Services below it names it (qits-2346),
            // and a service's page leads back.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/services/swarm-services.page').then(
                (m) => m.SwarmServicesPage,
              ),
          },
          {
            path: 'swarm/nodes',
            // An entry point (qits-2049, qits-2346): qits-system-frontend's old `swarm/nodes` hands
            // off here with a full-document load, and its bookmarks follow; Nodes below the
            // sidebar's System leads here too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/nodes/swarm-nodes.page').then((m) => m.SwarmNodesPage),
          },
          {
            path: 'swarm/nodes/:id',
            // An entry point (qits-2049): qits-system-frontend's old `swarm/nodes/:id` hands off
            // here with a full-document load (qits-2347); the nodes list links it too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/nodes/[id]/swarm-node.layout').then(
                (m) => m.SwarmNodeLayout,
              ),
            // The node's tabs (`NODE_TABS`, qits-2354) are added here, one child route each
            // (qits-2352 containers, qits-2353 images, qits-2355 volumes, qits-2354 networks); the
            // bare URL shows the node alone.
            children: [
              { path: '', children: [] },
              {
                // The node's Containers tab (qits-2352): every container on the node qits-system
                // runs on, filtered to the running ones, with each one's log tail. An entry point:
                // qits-system-frontend's old `swarm/nodes/:id/containers` hands off here.
                path: 'containers',
                data: { qitsEntry: true },
                loadComponent: () =>
                  import('./routes/system/swarm/nodes/[id]/containers/swarm-node-containers.page').then(
                    (m) => m.SwarmNodeContainersPage,
                  ),
              },
              {
                path: 'images',
                // An entry point (qits-2049): qits-system-frontend's old
                // `swarm/nodes/:id/images` hands off here with a full-document load (qits-2353).
                data: { qitsEntry: true },
                loadComponent: () =>
                  import('./routes/system/swarm/nodes/[id]/images/swarm-node-images.page').then(
                    (m) => m.SwarmNodeImagesPage,
                  ),
              },
              {
                path: 'volumes',
                // An entry point (qits-2355): qits-system-frontend's node volumes tab hands off here.
                data: { qitsEntry: true },
                loadComponent: () =>
                  import('./routes/system/swarm/nodes/[id]/volumes/swarm-node-volumes.page').then(
                    (m) => m.SwarmNodeVolumesPage,
                  ),
              },
              {
                path: 'networks',
                // An entry point (qits-2049, qits-2354): qits-system-frontend's old
                // `swarm/nodes/:id/networks` hands off here with a full-document load.
                data: { qitsEntry: true },
                loadComponent: () =>
                  import('./routes/system/swarm/nodes/[id]/networks/swarm-node-networks.page').then(
                    (m) => m.SwarmNodeNetworksPage,
                  ),
              },
            ],
          },
          {
            path: 'swarm/configs',
            // An entry point (qits-2049, qits-2348): qits-system-frontend's old `swarm/configs`
            // hands off here with a full-document load, and its bookmarks follow; Configs below
            // the sidebar's System leads here too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/configs/swarm-configs.page').then(
                (m) => m.SwarmConfigsPage,
              ),
          },
          {
            path: 'swarm/configs/:id',
            // An entry point (qits-2049): qits-system-frontend's old `swarm/configs/:id` hands off
            // here with a full-document load (qits-2349); the configs list links it too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/configs/[id]/swarm-config.page').then(
                (m) => m.SwarmConfigPage,
              ),
          },
          {
            path: 'swarm/secrets',
            // An entry point (qits-2049, qits-2350): qits-system-frontend's old `swarm/secrets`
            // hands off here with a full-document load, and its bookmarks follow; Secrets below the
            // sidebar's System leads here too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/swarm/secrets/swarm-secrets.page').then(
                (m) => m.SwarmSecretsPage,
              ),
          },
          {
            path: 'targets',
            // An entry point (qits-2049, qits-2351): qits-system-frontend's old `targets` hands off
            // here with a full-document load, and its bookmarks follow; Targets below the sidebar's
            // System and the Agents page's Targets link lead here too.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/system/targets/system-targets.page').then(
                (m) => m.SystemTargetsPage,
              ),
          },
        ],
      },
      {
        // The Mirror section (qits-2357): qits-mirror's pull-through caches, bound to no project.
        // No front page of its own yet: `/mirror` opens the OCI upstreams.
        path: 'mirror',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'upstreams' },
          {
            path: 'upstreams',
            // An entry point (qits-2049): qits-mirror-frontend's old `upstreams` hands off here
            // with a full-document load, and its bookmarks follow; the sidebar's Mirror leads to
            // `mirror`, which redirects here, so no outcome of this app names it.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/mirror/upstreams/mirror-upstreams.page').then(
                (m) => m.MirrorUpstreamsPage,
              ),
          },
          {
            path: 'repositories/:repository',
            // An entry point (qits-2049): qits-mirror-frontend's old `repositories/:repository`
            // hands off here with a full-document load (qits-2358). No outcome of this app names it
            // yet: qits-2471's list at `mirror/repositories` will link here.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/mirror/repositories/[repository]/mirror-repository.page').then(
                (m) => m.MirrorRepositoryPage,
              ),
          },
        ],
      },
      {
        // The Orchestrator section (qits-2359): qits-orchestrator's technical processes, bound to
        // no project. gc is the only process (its provider states assert it), so `/orchestrator`
        // and `/orchestrator/processes` open it; a list page waits for a second process.
        path: 'orchestrator',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'processes/gc' },
          { path: 'processes', pathMatch: 'full', redirectTo: 'processes/gc' },
          {
            path: 'processes/:kind',
            // An entry point (qits-2049): qits-orchestrator-frontend's old `''` and
            // `processes/:kind` hand off here with a full-document load, and their bookmarks
            // follow; the sidebar's Orchestrator leads to `orchestrator`, which redirects here.
            data: { qitsEntry: true },
            loadComponent: () =>
              import('./routes/orchestrator/processes/[kind]/orchestrator-process.page').then(
                (m) => m.OrchestratorProcessPage,
              ),
          },
        ],
      },
      {
        path: '**',
        loadComponent: () =>
          import('./routes/projects/project-picker.page').then((m) => m.ProjectPickerPage),
      },
    ],
  },
];
