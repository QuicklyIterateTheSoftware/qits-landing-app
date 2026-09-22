import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * `Server`, not the scaffold's `Prerender`, and that is the whole point of this repository.
 *
 * Prerender writes the html at BUILD time and serves it as a static file — which would put the
 * page's text in the response and still prove nothing about server rendering. `Server` renders on
 * every request, in the node process, which is what the `-app` archetype exists for: the visible
 * text is in the response body of a cold request, with no build-time snapshot behind it.
 *
 * It is also what makes the catch-all in `app.routes.ts` reachable. Prerendering a `**` route
 * needs a list of paths to prerender, and `/landing` — the prefix the edge routes here on every
 * vhost — is not one the builder can discover.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
