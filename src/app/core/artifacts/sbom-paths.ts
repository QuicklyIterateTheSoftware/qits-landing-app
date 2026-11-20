import type { HttpRequest } from '@angular/common/http';

/** Where qits-artifacts serves its SBOM store; only these URLs are rewritten. */
const SBOMS = '/artifacts/sboms/';

/**
 * `url` with the SBOM store's `packageName` on the wire as the store reads it (qits-2326): `/` and
 * `@` literal, everything else percent-encoded.
 *
 * The generated client percent-encodes every path parameter whole (`encodeURIComponent`), and
 * ignores the spec's `allowReserved`. The store keys a scoped npm package by its name as written:
 * `%40contract%2Fcontract-scoped` names no package and answers 404, `@contract/contract-scoped`
 * is the package. So the client's encoding is kept and only `%2F` and `%40` are turned back, as
 * `literalDocsUrl` does for the docs store. That is exact: `encodeURIComponent` writes `%2F` and
 * `%40` for `/` and `@` alone (a literal `%` becomes `%25`); the package type and the version hold
 * neither, and a maven coordinate's `:` stays `%3A`, as the store reads it.
 */
export function literalSbomUrl(url: string): string {
  const at = url.indexOf(SBOMS);
  if (at < 0) return url;
  const query = url.indexOf('?', at);
  const end = query < 0 ? url.length : query;
  const path = url.slice(at, end).replace(/%2F/g, '/').replace(/%40/g, '@');
  return url.slice(0, at) + path + url.slice(end);
}

/** The artifacts client's request interceptor: {@link literalSbomUrl} on every SBOM request. */
export function literalSbomPaths<T>(request: HttpRequest<T>): HttpRequest<T> {
  const url = literalSbomUrl(request.url);
  return url === request.url ? request : request.clone({ url });
}
