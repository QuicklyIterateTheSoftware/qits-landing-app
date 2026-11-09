import type { HttpRequest } from '@angular/common/http';

/** Where qits-artifacts serves its docs store; only these URLs are rewritten. */
const DOCS = '/artifacts/docs/';

/**
 * `url` with the docs store's `site` and `path` parameters on the wire as the store reads them:
 * `/` and `@` literal, everything else percent-encoded.
 *
 * The generated client percent-encodes every path parameter whole (`encodeURIComponent`), and
 * ignores the spec's `allowReserved`. The store answers 404 to `%40routes%2Fqits-landing` and needs
 * `@routes/qits-landing`; inside a file path it needs `/` literal but `[` and `]` encoded
 * (`[slug]` is a 400, `%5Bslug%5D` a 200). So the client's encoding is kept and only `%2F` and
 * `%40` are turned back. That is exact: `encodeURIComponent` writes `%2F` and `%40` for `/` and `@`
 * alone (a literal `%` becomes `%25`), and the repository and version segments hold neither.
 */
export function literalDocsUrl(url: string): string {
  const at = url.indexOf(DOCS);
  if (at < 0) return url;
  const query = url.indexOf('?', at);
  const end = query < 0 ? url.length : query;
  const path = url.slice(at, end).replace(/%2F/g, '/').replace(/%40/g, '@');
  return url.slice(0, at) + path + url.slice(end);
}

/** The artifacts client's request interceptor: {@link literalDocsUrl} on every docs request. */
export function literalDocsPaths<T>(request: HttpRequest<T>): HttpRequest<T> {
  const url = literalDocsUrl(request.url);
  return url === request.url ? request : request.clone({ url });
}
