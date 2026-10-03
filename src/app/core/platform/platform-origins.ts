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
 * Where each platform application answers. Two questions:
 *
 * - `api(app)`: the origin of `app`'s calls, its event stream and (for the idp) its sign-in pages.
 *   An origin with no trailing slash, or `''` for same-origin.
 * - `page(app)`: the origin of `app` opened as a page of its own (a frame, a link). `''` while it
 *   is not known.
 *
 * Both are `https://<label>.<domain>`: deployed, the domain is this page's hostname
 * ({@link HostPlatformOrigins}); under `ng serve`, it is `platformDomain` from
 * `environment.development.ts` ({@link DomainPlatformOrigins}), and the calls carry a bearer
 * (`core/auth/dev-bearer.ts`). A spec provides its own.
 */
@Injectable({
  providedIn: 'root',
  useFactory: () =>
    environment.platformDomain
      ? new DomainPlatformOrigins(environment.platformDomain)
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

/** `ng serve`: every application under the stated platform domain, for calls and pages alike. */
export class DomainPlatformOrigins extends PlatformOrigins {
  constructor(private readonly domain: string) {
    super();
  }

  api(app: PlatformApp): string {
    return this.page(app);
  }

  page(app: PlatformApp): string {
    return hostOrigin(app, this.domain);
  }
}
