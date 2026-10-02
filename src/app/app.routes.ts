import { Routes } from '@angular/router';
import { sessionGuard } from './auth/session.guard';
import { Layout } from './layout/layout';
import { ProjectPage } from './projects/project-page';
import { ProjectPicker } from './projects/project-picker';
import { ProjectSetup } from './projects/project-setup';
import { ProjectWork } from './projects/project-work';
import { RootRedirect } from './root-redirect';

/**
 * The root hands on to `projects` (`RootRedirect`, see there why not `redirectTo`), the project
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
 * `Layout` is the root route component, so the chrome survives navigation and only the outlet
 * beneath it changes. `sessionGuard` sends a visitor without a session to the idp's login page.
 */
export const routes: Routes = [
  {
    path: '',
    component: Layout,
    canActivate: [sessionGuard],
    children: [
      { path: '', component: RootRedirect },
      { path: 'projects', component: ProjectPicker },
      { path: 'projects/:slug', component: ProjectPage },
      { path: 'projects/:slug/work', component: ProjectWork },
      { path: 'projects/:slug/setup', component: ProjectSetup },
      { path: '**', component: ProjectPicker },
    ],
  },
];
