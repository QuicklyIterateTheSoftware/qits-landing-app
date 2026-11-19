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
 * qits-artifacts' docs store, by section, narrowed by `?section=` and `?q=`.
 *
 * The Observability section (qits-2313): `projects/<slug>/observability` is a parent with no
 * component, its pages its children; `/observability` opens `logs` (`ObservabilityLogsPage`, the
 * telemetry buffer's log lines of one source) by a relative `redirectTo`, which keeps the query, so
 * `/observability?source=_service/qits-ci` lands on that source's logs.
 *
 * The Deployments section (qits-2315): `projects/<slug>/deployments` is a parent with no
 * component, like Observability; `/deployments` opens `requests` (`DeploymentRequestsPage`, the
 * project's deployment requests, pending and completed) by a relative `redirectTo`.
 *
 * The Maintenance section (qits-2317): `projects/<slug>/maintenance` is a parent with no
 * component, its pages its children; `/maintenance` opens `dependencies`
 * (`MaintenanceDependenciesPage`, the project's internal and external pins, the behind ones first)
 * by a relative `redirectTo`, which keeps the query, so `/maintenance?behind=true` lands on the
 * behind pins only.
 * `maintenance/artifacts` (`MaintenanceArtifactsPage`, qits-2330) is what the project has
 * released and who still ships an old copy: the listing, and one artifact's dependents at
 * `?ecosystem=&name=` on the same page. It is not the global `/artifacts` (the artifact store,
 * qits-2316).
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
 * the execution targets a slot is placed on are qits-system's, at its own Targets page, which the
 * Agents page links to directly rather than routing through here.
 *
 * The Network access pane (epic qits-1977) is at `network-access` (`NetworkAccessPage`): the
 * platform's peers, nodes and private edge, reached from the top bar with no project open.
 *
 * The Artifacts section (qits-2316) is at `artifacts/repositories/<repo>` (`ArtifactsRepositoryPage`):
 * one of qits-artifacts' store repositories (`qits`, `npm`, `maven`, …), reached from the root
 * sidebar with no project open, as nothing in the store joins to a project. `artifacts` and
 * `artifacts/repositories` redirect to `artifacts/repositories/qits`, the image store, by a
 * relative `redirectTo`.
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
        ],
      },
      {
        path: 'projects/:slug/docs',
        loadComponent: () =>
          import('./routes/projects/[slug]/docs/project-docs.page').then((m) => m.ProjectDocsPage),
      },
      {
        path: 'projects/:slug/events',
        loadComponent: () =>
          import('./routes/projects/[slug]/events/project-events.page').then(
            (m) => m.ProjectEventsPage,
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
        ],
      },
      {
        // The platform's private network (epic qits-1977): not a project's, so no project opens.
        path: 'network-access',
        loadComponent: () =>
          import('./routes/network-access/network-access.page').then((m) => m.NetworkAccessPage),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./routes/projects/project-picker.page').then((m) => m.ProjectPickerPage),
      },
    ],
  },
];
