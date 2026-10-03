import { DOCUMENT, isPlatformBrowser } from '@angular/common';
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

/** The applications this app opens in a page of their own (a frame, a link), never calls. */
export type PageApp = 'workspaces';

/** Every application whose origin this app reads. */
export type App = Backend | PageApp;

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

/** The same, for the applications this app only opens. */
export const PAGE_APPS: Readonly<Record<PageApp, readonly string[]>> = {
  workspaces: ['qits-workspaces'],
};

const APPS: Readonly<Record<App, readonly string[]>> = { ...BACKEND_APPS, ...PAGE_APPS };
const BACKENDS = Object.keys(BACKEND_APPS) as Backend[];
const PAGES = Object.keys(PAGE_APPS) as PageApp[];

/** The edge answers this on every host, this app's own included. */
export const NAVIGATION_PATH = '/main-navigation';

/** The part of the navigation this app reads: its own `origin` and `applications.<app>.origin`. */
interface Navigation {
  readonly origin?: string | null;
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

/** This page's hostname. A spec provides it. */
export const PAGE_HOSTNAME = new InjectionToken<string>('PAGE_HOSTNAME', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location.hostname,
});

/**
 * `value` as an origin with no trailing slash, if it is `https:` on `domain` or a name under it;
 * otherwise `undefined`. The navigation is data, so an origin that would send the session cookie
 * or a frame elsewhere counts as missing.
 */
export function trustedOrigin(
  value: string | null | undefined,
  domain: string,
): string | undefined {
  if (!value || !domain) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  const host = url.hostname.toLowerCase();
  const base = domain.toLowerCase();
  return host === base || host.endsWith(`.${base}`) ? url.origin : undefined;
}

/** The hostname of the navigation's own `origin` when it is `https:`, else `''`. */
function statedDomain(navigation: Navigation | null): string {
  try {
    const url = new URL(navigation?.origin ?? '');
    return url.protocol === 'https:' ? url.hostname : '';
  } catch {
    return '';
  }
}

/**
 * Where each application answers (epic qits-528). The edge routes an application's paths on that
 * application's own host only, so a call to `/projects/api/…` goes to qits-projects' origin, as
 * `GET /main-navigation` states it in `applications.<app>.origin`. Nothing here composes a
 * hostname.
 *
 * `load()` runs once, from an app initializer, before the first call (`app.config.ts`). Then
 * `origin(app)` is the prefix for that application's paths:
 *
 * - an origin (`https://projects.qits.wohlben.eu`): a backend call is cross-origin and carries the
 *   session cookie itself (`credentials: 'include'`, `withCredentials: true`).
 * - `''`: same-origin. That is the answer for every backend under `ng serve`
 *   ({@link SAME_ORIGIN_APIS}), for everything on the server (it never calls a backend: it has no
 *   session cookie), and for an application the navigation could not name. The last case is a
 *   fault, and `failed()` shows it.
 *
 * An origin counts only if it is `https:` on the platform's domain or a name under it
 * ({@link trustedOrigin}). Deployed, that domain is this page's hostname: the app lives at the
 * platform's apex and every application at `<app>.<apex>`. Under `ng serve` the page is on
 * localhost, so the domain is the one the navigation states in its own `origin`. That is safe
 * because there the navigation comes through `proxy.conf.json`, which the developer chose; and the
 * only origins read there are page applications (the editor frame), since the backends stay on the
 * proxy.
 */
@Injectable({ providedIn: 'root' })
export class AppOrigins {
  private readonly injector = inject(Injector);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sameOrigin = inject(SAME_ORIGIN_APIS);
  private readonly hostname = inject(PAGE_HOSTNAME);

  private readonly origins = signal<Readonly<Partial<Record<App, string>>>>({});

  /** The applications with no trusted origin, or all that were asked for when the navigation failed. */
  readonly missing = signal<readonly App[]>([]);

  /** True when some application has no address: its calls or its frame go nowhere useful. */
  readonly failed = computed(() => this.missing().length > 0);

  /** True when some backend has no address: its calls go to this page's origin and fail. */
  readonly backendsFailed = computed(() =>
    this.missing().some((app) => (BACKENDS as readonly App[]).includes(app)),
  );

  /** Reads `/main-navigation` in the browser; on the server every origin stays `''`. Never throws. */
  async load(): Promise<void> {
    if (!this.browser) return;
    // Under `ng serve` the backends stay on the proxy: only page applications are read.
    const wanted: readonly App[] = this.sameOrigin ? PAGES : [...BACKENDS, ...PAGES];
    let navigation: Navigation | null;
    try {
      // HttpClient is asked for here, not in a field: a spec of a user of this service need not
      // provide one.
      const http = this.injector.get(HttpClient);
      navigation = await firstValueFrom(http.get<Navigation>(NAVIGATION_PATH));
    } catch {
      this.missing.set(wanted);
      return;
    }
    const domain = this.sameOrigin ? statedDomain(navigation) : this.hostname;
    const origins: Partial<Record<App, string>> = {};
    for (const app of wanted) {
      const origin = APPS[app]
        .map((name) => navigation?.applications?.[name]?.origin)
        .find((value): value is string => !!value);
      const trusted = trustedOrigin(origin, domain);
      if (trusted) origins[app] = trusted;
    }
    this.origins.set(origins);
    this.missing.set(wanted.filter((app) => origins[app] === undefined));
  }

  /** The origin to put in front of `app`'s paths: an origin with no trailing slash, or `''`. */
  origin(app: App): string {
    return this.origins()[app] ?? '';
  }
}
