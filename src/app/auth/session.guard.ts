import { DOCUMENT, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import type { CanActivateFn } from '@angular/router';
import { AppOrigins } from '../core/platform/app-origins';
import { ProjectsStore } from '../core/projects/projects.store';

/**
 * Sends a visitor without a session to the idp's login page, which sends them back here.
 *
 * The check is a cheap read that the edge only lets through with a valid `qits-session` cookie;
 * without one, the edge answers 401.
 *
 * The server render passes: it holds no cookie to check, and the browser checks right after. So
 * does a page whose backend origins are not known (`AppOrigins.backendsFailed()`): the layout says so,
 * and a login page on this host would be a guess.
 */
export const sessionGuard: CanActivateFn = async (_route, state) => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  // Every inject() before the first await: after it, the injection context is gone.
  const location = inject(DOCUMENT).location;
  const origins = inject(AppOrigins);
  const projects = inject(ProjectsStore);
  if (origins.backendsFailed()) return true;
  if (!(await projects.hasSession())) {
    location.assign(loginUrl(origins.origin('idp'), location.host, state.url));
    return false;
  }
  return true;
};

/**
 * The idp's login page, with the way back to `url` on this page's host.
 *
 * - On the idp's own origin (deployed): `return_host` + `return_path`, the same pair the edge
 *   sends. The idp checks the host against its allow-list (every name under the platform's
 *   domain, the apex included) and sends the visitor to `https://<return_host><return_path>`.
 * - Same-origin (`ng serve`, where `proxy.conf.json` serves `/idp`): the legacy `redirect=<path>`,
 *   which the login page follows on its own origin, here localhost. The idp's allow-list would
 *   refuse `localhost` as a return host.
 */
export function loginUrl(idpOrigin: string, host: string, url: string): string {
  if (!idpOrigin) return `/idp/login?redirect=${encodeURIComponent(returnPath(url))}`;
  return `${idpOrigin}/idp/login?return_host=${encodeURIComponent(host)}&return_path=${encodeURIComponent(url)}`;
}

/**
 * The login page reads a bare `redirect=/` as "no target" and then sends the visitor to the
 * platform's landing host instead of back here. `/?` is the same page and is followed on this
 * origin.
 */
function returnPath(url: string): string {
  return url === '/' ? '/?' : url;
}
