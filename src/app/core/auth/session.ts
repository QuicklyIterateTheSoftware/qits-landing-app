import { DOCUMENT, inject, Injectable } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectsStore } from '$core/projects/projects.store';

/**
 * How the browser makes sure the visitor is signed in (`sessionGuard`).
 *
 * Deployed: {@link CookieSession}. Under `ng serve` the `development` environment provides the
 * bearer sign-in instead (`dev-bearer.ts`), so that code is never in the deployed bundle.
 */
@Injectable({ providedIn: 'root', useFactory: () => new CookieSession() })
export abstract class Session {
  /**
   * True when the visitor is signed in. Otherwise starts the sign-in, which comes back to `url`
   * on this host, and answers false.
   */
  abstract ensure(url: string): Promise<boolean>;
}

/**
 * Finishes a sign-in that came back to `/auth/callback` (`AuthCallbackPage`). Only `ng serve`
 * provides one; deployed, the idp sets the session cookie and never sends the visitor there.
 */
export abstract class SignInCallback {
  /** Takes the callback's query; answers the path to go on to, or throws. */
  abstract complete(query: URLSearchParams): Promise<string>;
}

/**
 * Deployed: the `qits-session` cookie. The check is a cheap read that the edge only lets through
 * with a valid cookie; without one, the edge answers 401, and the visitor goes to the idp's login
 * page, which sends them back here.
 */
export class CookieSession extends Session {
  private readonly location = inject(DOCUMENT).location;
  private readonly origins = inject(PlatformOrigins);
  private readonly projects = inject(ProjectsStore);

  async ensure(url: string): Promise<boolean> {
    if (await this.projects.hasSession()) return true;
    this.location.assign(loginUrl(this.origins.api('idp'), this.location.host, url));
    return false;
  }
}

/**
 * The idp's login page, with the way back to `url` on this page's host: `return_host` +
 * `return_path`, the same pair the edge sends. The idp checks the host against its allow-list
 * (every name under the platform's domain, the apex included) and sends the visitor to
 * `https://<return_host><return_path>`.
 */
export function loginUrl(idpOrigin: string, host: string, url: string): string {
  return `${idpOrigin}/idp/login?return_host=${encodeURIComponent(host)}&return_path=${encodeURIComponent(url)}`;
}
