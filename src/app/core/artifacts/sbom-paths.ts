import type { HttpRequest } from '@angular/common/http';

/** Where qits-artifacts serves its SBOM store; only these URLs are rewritten. */
const SBOMS = '/artifacts/sboms/';

/**
 * `url` with the SBOM store's `packageName` on the wire as the store reads it: `:`, `@` and `/`
 * literal, everything else as the client encoded it (qits-2325).
 *
 * The generated client percent-encodes every path parameter whole (`encodeURIComponent`), and
 * ignores the spec's `allowReserved`. The SBOM store is a Vert.x regex route over the raw path: a
 * name is up to four `/`-separated segments of `@?[A-Za-z0-9][A-Za-z0-9._~:-]{0,127}`, so it
 * answers `eu.wohlben.qits:qits-eventstream` and `@qits/angular` but 404s ("not a route this sbom
 * store serves") on `eu.wohlben.qits%3Aqits-eventstream` and `%40qits%2Fangular`. So the client's
 * encoding is kept and only `%3A`, `%40` and `%2F` are turned back. That is exact:
 * `encodeURIComponent` writes those for `:`, `@` and `/` alone (a literal `%` becomes `%25`), and
 * the package type and version segments hold none of them. The query is left as it is, and so is
 * every other door: the `/artifacts/api/` versions door takes a coordinate encoded.
 */
export function literalSbomUrl(url: string): string {
  const at = url.indexOf(SBOMS);
  if (at < 0) return url;
  const query = url.indexOf('?', at);
  const end = query < 0 ? url.length : query;
  const path = url.slice(at, end).replace(/%3A/g, ':').replace(/%40/g, '@').replace(/%2F/g, '/');
  return url.slice(0, at) + path + url.slice(end);
}

/** The artifacts client's request interceptor: {@link literalSbomUrl} on every SBOM request. */
export function literalSbomPaths<T>(request: HttpRequest<T>): HttpRequest<T> {
  const url = literalSbomUrl(request.url);
  return url === request.url ? request : request.clone({ url });
}
