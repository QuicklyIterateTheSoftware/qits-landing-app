import { Routes } from '@angular/router';
import { sessionGuard } from '$core/auth/session.guard';

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
 * beneath it changes. `sessionGuard` sends a visitor without a session to the idp's login page.
 *
 * The work section: `projects/<slug>/work` is `WorkLayout`, a row of tabs over its pages
 * (`campaigns`, `refinement`, `schedule`, `in-progress`, `acceptance`, `archive`). An item's page is at
 * `work/detail/<qualified id>`, so an id can never be taken for a tab; it sits outside the layout,
 * with no tabs. `/work` opens `in-progress` by a `redirectTo`, not a page as at the root: the
 * redirect happens before the URL is written, so `/work` never enters the history and Back has
 * nothing to bounce on, and the server answers `/work` with a 302 instead of rendering an empty
 * page.
 *
 * A project's release requests are at `projects/<slug>/release-requests` (`ReleaseRequestsPage`).
 *
 * A work item's workspace is at `projects/<slug>/workspaces/<qualified id>` (`WorkspacePage`),
 * where the workspace links on cards lead.
 *
 * `auth/callback` is where the `ng serve` sign-in comes back to (`AuthCallbackPage`); it sits
 * outside the shell, so the guard does not run on it.
 */
export const routes: Routes = [
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./routes/auth/callback/auth-callback.page').then((m) => m.AuthCallbackPage),
  },
  {
    path: '',
    loadComponent: () => import('$layout/shell/shell.layout').then((m) => m.ShellLayout),
    canActivate: [sessionGuard],
    children: [
      { path: '', loadComponent: () => import('./routes/root.page').then((m) => m.RootPage) },
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
        path: 'projects/:slug/work',
        loadComponent: () =>
          import('./routes/projects/[slug]/work/work.layout').then((m) => m.WorkLayout),
        children: [
          // A redirect, not a page like the root's `RootPage`: see "The work section" above.
          { path: '', pathMatch: 'full', redirectTo: 'in-progress' },
          {
            path: 'campaigns',
            loadComponent: () =>
              import('./routes/projects/[slug]/work/campaigns/work-campaigns.page').then(
                (m) => m.WorkCampaignsPage,
              ),
          },
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
        path: 'projects/:slug/workspaces/:id',
        loadComponent: () =>
          import('./routes/projects/[slug]/workspaces/[id]/workspace.page').then(
            (m) => m.WorkspacePage,
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
        path: 'projects/:slug/editor',
        loadComponent: () =>
          import('./routes/projects/[slug]/editor/project-editor.page').then(
            (m) => m.ProjectEditorPage,
          ),
      },
      {
        path: 'projects/:slug/repositories',
        loadComponent: () =>
          import('./routes/projects/[slug]/repositories/project-repositories.page').then(
            (m) => m.ProjectRepositoriesPage,
          ),
      },
      {
        path: 'projects/:slug/observability',
        loadComponent: () =>
          import('./routes/projects/[slug]/observability/project-observability.page').then(
            (m) => m.ProjectObservabilityPage,
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
        path: 'projects/:slug/setup',
        loadComponent: () =>
          import('./routes/projects/[slug]/setup/project-setup.page').then(
            (m) => m.ProjectSetupPage,
          ),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./routes/projects/project-picker.page').then((m) => m.ProjectPickerPage),
      },
    ],
  },
];
