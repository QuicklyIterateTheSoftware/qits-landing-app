/**
 * The service worker this app registers (`provideAppUpdates`, `core/updates/app-updates.ts`): a
 * wrapper around Angular's `ngsw-worker.js` that keeps every cross-origin request out of the
 * worker (qits-2297).
 *
 * ngsw answers every request itself, cross-origin included (`respondWith`, then its own `fetch`).
 * A call from this public page to a platform app on the private network (the tunnel) needs Chrome's
 * Local Network Access permission, and a worker can neither raise that prompt nor use the page's
 * grant, so ngsw's fetch fails and the page gets a synthetic 504. The listener below runs first,
 * because it is added before ngsw's: for a request to another origin it stops the event there and
 * does not answer it, so the browser makes the request itself, as the page asked for it, prompt
 * included. Same-origin requests (the app's own files, its navigations, the edge's documents) go on
 * to ngsw as before.
 *
 * Plain script, copied unchanged by the build (`public/`); `sw.js` is served `no-cache` with the
 * worker's own files (`UNHASHED`, `src/server.ts`). `service-worker.spec.ts` beside
 * `app-updates.ts` runs it against a fake worker scope.
 */
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) {
    event.stopImmediatePropagation();
  }
});

importScripts('ngsw-worker.js');
