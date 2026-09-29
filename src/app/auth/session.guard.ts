import { DOCUMENT, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import type { CanActivateFn } from '@angular/router';
import { getProjectsApiProjects } from '../api/projects';

/**
 * Sends a visitor without a session to the idp's login page, which sends them back here.
 *
 * The check is a cheap read that the edge only lets through with a valid `qits-session` cookie;
 * without one, the edge answers 401.
 *
 * The return target is a same-origin path (`redirect=/…`). The login page follows such a path on
 * its own origin, so the visitor comes back to this app whether it runs behind the edge or under
 * `ng serve`, where `proxy.conf.json` serves `/idp` from the platform.
 *
 * The server render passes: it holds no cookie to check, and the browser checks right after.
 */
export const sessionGuard: CanActivateFn = async (_route, state) => {
  if (isPlatformServer(inject(PLATFORM_ID))) return true;
  // Every inject() before the first await: after it, the injection context is gone.
  const location = inject(DOCUMENT).location;
  const { response } = await getProjectsApiProjects();
  if (response?.status === 401) {
    location.assign(`/idp/login?redirect=${encodeURIComponent(returnPath(state.url))}`);
    return false;
  }
  return true;
};

/**
 * The login page reads a bare `/` as "no target" and then sends the visitor to the platform's
 * landing host instead of back here. `/?` is the same page and is followed on this origin.
 */
function returnPath(url: string): string {
  return url === '/' ? '/?' : url;
}
