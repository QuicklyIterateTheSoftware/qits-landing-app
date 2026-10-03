import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { environment } from '../../../environments/environment';

/** The platform applications this app calls or opens. */
export type PlatformApp = 'projects' | 'githost' | 'events' | 'maintenance' | 'idp' | 'workspaces';

/**
 * Each application's host label: it answers at `https://<label>.<domain>` (epic qits-528). The one
 * place a hostname is composed.
 */
export const HOST_LABELS: Readonly<Record<PlatformApp, string>> = {
  projects: 'projects',
  githost: 'githost',
  events: 'events',
  maintenance: 'maintenance',
  idp: 'idp',
  workspaces: 'workspaces',
};

/** `https://<label of app>.<domain>`. */
export function hostOrigin(app: PlatformApp, domain: string): string {
  return `https://${HOST_LABELS[app]}.${domain}`;
}

/**
 * Where each platform application answers. Two questions, because `ng serve` answers them
 * differently:
 *
 * - `api(app)`: the prefix for `app`'s paths that this page reaches as itself: calls, the event
 *   stream, and the idp's login page, which must set the session cookie for this page's host. An
 *   origin with no trailing slash, or `''` for same-origin.
 * - `page(app)`: the origin of `app` opened as a page of its own (a frame, a link). Always the
 *   real host, never this page's origin; `''` while it is not known.
 *
 * Deployed, both are `https://<label>.<domain>`. Under `ng serve`, `proxy.conf.json` serves every
 * api path on localhost, so `api` is `''`; a page is never proxied, so `page` stays the real host.
 *
 * Provided by {@link HostPlatformOrigins} (deployed) or {@link ProxiedPlatformOrigins}
 * (`ng serve`), from the build's environment file. A spec provides its own.
 */
@Injectable({
  providedIn: 'root',
  useFactory: () =>
    environment.platformDomain
      ? new ProxiedPlatformOrigins(environment.platformDomain)
      : new HostPlatformOrigins(),
})
export abstract class PlatformOrigins {
  abstract api(app: PlatformApp): string;
  abstract page(app: PlatformApp): string;
}

/**
 * Deployed: the app is served at the platform's apex, so every application is a name under this
 * page's hostname. On the server both answers are `''`: the server never calls a backend (it has
 * no session cookie), and its request host need not be the public one.
 */
@Injectable()
export class HostPlatformOrigins extends PlatformOrigins {
  private readonly domain = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).location.hostname
    : '';

  api(app: PlatformApp): string {
    return this.page(app);
  }

  page(app: PlatformApp): string {
    return this.domain ? hostOrigin(app, this.domain) : '';
  }
}

/**
 * `ng serve`: api paths stay on this page's origin, where `proxy.conf.json` forwards them; pages
 * open on `domain`, the platform the proxy points at.
 */
export class ProxiedPlatformOrigins extends PlatformOrigins {
  constructor(private readonly domain: string) {
    super();
  }

  api(): string {
    return '';
  }

  page(app: PlatformApp): string {
    return hostOrigin(app, this.domain);
  }
}
