/**
 * The reader's address grammar (qits-2337), ported from qits-docs-frontend's `doc-url.ts`: a site
 * and an optional version after `read`, the two split by `/-/`, the separator the docs store
 * spells a versioned site with (`<site>/-/<version>`). `projects/<slug>/docs/read/<site>` reads the
 * site's newest version of `main`, `…/read/<site>/-/<version>` that version.
 *
 * A site's name spans segments (`@userflows/qits-events`): the docs app's redirect writes it split
 * (`read/@userflows/qits-events`), this app's own links write it as one segment with its `/`
 * escaped (`read/@userflows%2Fqits-events`, an exit's param). The router decodes either into
 * segments whose joined paths are the same text, so {@link parseReadPath} reads both alike.
 */

/** A read address, taken apart. No version means the newest of `main`, which only the list names. */
export interface ReadPath {
  readonly site: string;
  readonly version?: string;
}

const SEPARATOR = '/-/';

/**
 * The site and version of `read/@qits/ui-components/-/2026.807.0`'s segments (each segment's
 * decoded path). A leading literal `read` is dropped: under a `read/**` route the route's url
 * carries it, and a site of `read/…` would read nothing.
 */
export function parseReadPath(segments: readonly string[]): ReadPath {
  const path = (segments[0] === 'read' ? segments.slice(1) : segments).join('/');
  const marker = path.indexOf(SEPARATOR);
  return marker < 0
    ? { site: path }
    : { site: path.slice(0, marker), version: path.slice(marker + SEPARATOR.length) };
}

/**
 * The router commands that open a site, the inverse of {@link parseReadPath}: `prefix`, `read`,
 * the name split on `/` (one command is one segment, and a `/` inside it would be escaped), then
 * `-` and the version when there is one.
 */
export function readCommands(
  site: string,
  version?: string,
  prefix: readonly string[] = ['/'],
): string[] {
  const commands = [...prefix, 'read', ...site.split('/')];
  return version ? [...commands, '-', version] : commands;
}
