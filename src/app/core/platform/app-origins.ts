import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** The backends this app calls. */
export type Backend = 'projects' | 'githost' | 'events' | 'maintenance' | 'idp';

/**
 * The application names `/main-navigation` may file each backend under, first match wins. The
 * second name of maintenance and idp is the old `qits-platform-…` deployed name, which the live
 * navigation still serves (2026-10-03).
 */
export const BACKEND_APPS: Readonly<Record<Backend, readonly string[]>> = {
  projects: ['qits-projects'],
  githost: ['qits-githost'],
  events: ['qits-events'],
  maintenance: ['qits-maintenance', 'qits-platform-maintenance'],
  idp: ['qits-idp', 'qits-platform-idp'],
};

/** The edge answers this on every host, this app's own included. */
export const NAVIGATION_PATH = '/main-navigation';

/** The part of the navigation this app reads: `applications.<app>.origin`. */
interface Navigation {
  readonly applications?: Readonly<Record<string, { readonly origin?: string | null }>>;
}

/**
 * True: every backend is called on this page's own origin (`ng serve`, through
 * `proxy.conf.json`). From the build's environment file; a spec provides it.
 */
export const SAME_ORIGIN_APIS = new InjectionToken<boolean>('SAME_ORIGIN_APIS', {
  providedIn: 'root',
  factory: () => environment.sameOriginApis,
});

/**
 * Where each backend answers (epic qits-528). The edge routes an application's paths on that
 * application's own host only, so a call to `/projects/api/…` goes to qits-projects' origin, as
 * `GET /main-navigation` states it in `applications.<app>.origin`. Nothing here composes a
 * hostname.
 *
 * `load()` runs once, from an app initializer, before the first call (`app.config.ts`). Then
 * `origin(backend)` is the prefix for that backend's paths:
 *
 * - an origin (`https://projects.qits.wohlben.eu`): the call is cross-origin and carries the
 *   session cookie itself (`credentials: 'include'`, `withCredentials: true`).
 * - `''`: same-origin. That is the answer under `ng serve` ({@link SAME_ORIGIN_APIS}), on the
 *   server (it never calls a backend: it has no session cookie), and for a backend the
 *   navigation could not name. The last case is a fault, and `failed()` shows it.
 */
@Injectable({ providedIn: 'root' })
export class AppOrigins {
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sameOrigin = inject(SAME_ORIGIN_APIS);

  private readonly origins = signal<Readonly<Partial<Record<Backend, string>>>>({});
  private readonly navigationFailed = signal(false);

  /** The backends the navigation named no origin for, or all of them when it failed. */
  readonly missing = signal<readonly Backend[]>([]);

  /** True when some backend has no address: its calls go to this page's origin and fail. */
  readonly failed = computed(() => this.navigationFailed() || this.missing().length > 0);

  /** Reads `/main-navigation` in the browser; elsewhere every origin stays `''`. Never throws. */
  async load(): Promise<void> {
    if (!this.browser || this.sameOrigin) return;
    const backends = Object.keys(BACKEND_APPS) as Backend[];
    let navigation: Navigation;
    try {
      // HttpClient is asked for here, not in a field: a spec of a user of this service need not
      // provide one.
      const http = this.injector.get(HttpClient);
      navigation = await firstValueFrom(http.get<Navigation>(NAVIGATION_PATH));
    } catch {
      this.navigationFailed.set(true);
      this.missing.set(backends);
      return;
    }
    const origins: Partial<Record<Backend, string>> = {};
    for (const backend of backends) {
      const origin = BACKEND_APPS[backend]
        .map((app) => navigation?.applications?.[app]?.origin)
        .find((value): value is string => !!value);
      if (origin) origins[backend] = origin.replace(/\/+$/, '');
    }
    this.origins.set(origins);
    this.missing.set(backends.filter((backend) => origins[backend] === undefined));
  }

  /** The origin to put in front of `backend`'s paths: an origin with no trailing slash, or `''`. */
  origin(backend: Backend): string {
    return this.origins()[backend] ?? '';
  }
}
