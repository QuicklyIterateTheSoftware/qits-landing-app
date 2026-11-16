/**
 * Calls to the platform apps on the private network (qits-2297).
 *
 * The page lives on the public origin `https://qits.<domain>`; some platform apps answer on a
 * private address (the tunnel's private edge), others publicly. Chrome's Local Network Access asks
 * the person once per site before a public page may call a local address. A call that says so
 * up front, `fetch(url, { targetAddressSpace: 'local' })`, is one Chrome expects to go to the local
 * network, so it may prompt for it rather than treat the address as a surprise.
 *
 * Which origins are private comes from the edge (`PrivateApps`, `core/platform/private-apps.ts`,
 * which hands them to {@link setPrivateOrigins} once the person is signed in). The set is plain
 * module state, not a service, because the fetch wrapper is installed on `globalThis.fetch` in
 * `main.ts` before the app is bootstrapped (Angular's fetch backend keeps the `fetch` it finds
 * first) and reads it on every call. A browser without Local Network Access ignores the unknown
 * option.
 */

/** Where a request is meant to go, as Chrome's Local Network Access names it. */
export type TargetAddressSpace = 'local' | 'loopback' | 'public';

/** `RequestInit` with Chrome's Local Network Access option, which the DOM types do not know yet. */
export type LocalNetworkRequestInit = RequestInit & { targetAddressSpace?: TargetAddressSpace };

/** The origins of the platform apps on the private network; empty until the edge names them. */
let privateOrigins: ReadonlySet<string> = new Set();

/** Replaces the private origins: each an origin (`https://projects.qits.example.com`). */
export function setPrivateOrigins(origins: Iterable<string>): void {
  privateOrigins = new Set(origins);
}

/** The private origins as they are now. */
export function currentPrivateOrigins(): ReadonlySet<string> {
  return privateOrigins;
}

/** The origin `input` is addressed to, relative URLs against `base`; undefined when unreadable. */
function originOf(input: RequestInfo | URL, base: string): string | undefined {
  const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
  try {
    return new URL(url, base).origin;
  } catch {
    return undefined;
  }
}

/**
 * A `fetch` that marks each call to a private origin with `targetAddressSpace: 'local'` and passes
 * every other call to `original` exactly as it was made. A `Request` is passed on as it is (its
 * method, headers and body kept); only the option is added beside it.
 */
export function localNetworkFetch(original: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const origin = originOf(input, globalThis.location?.href ?? 'http://localhost/');
    if (origin === undefined || !privateOrigins.has(origin)) {
      return init === undefined ? original(input) : original(input, init);
    }
    const marked: LocalNetworkRequestInit = { ...init, targetAddressSpace: 'local' };
    return original(input, marked);
  };
}

/**
 * Puts {@link localNetworkFetch} on `globalThis.fetch`. In the browser only (`main.ts`, after the
 * telemetry wrapped `fetch` and before the bootstrap); never on the server.
 */
export function installLocalNetworkFetch(): void {
  globalThis.fetch = localNetworkFetch(globalThis.fetch.bind(globalThis));
}
