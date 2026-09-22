import { Routes } from '@angular/router';
import { Landing } from './landing/landing';

/**
 * Two routes, and the second one is load-bearing rather than tidy.
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
 */
export const routes: Routes = [
  { path: '', component: Landing },
  { path: '**', component: Landing },
];
