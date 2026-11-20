import { NONE } from '$core/release-requests/release-request-model';
import { payloadIds, payloadOf } from './refresh-on';

/**
 * The pure half of an event's page (qits-2338, ported from qits-events-frontend's `event/payload.ts`
 * and `log/event-summary.ts`): whether the event is the open project's (`belongsToProject`), its
 * payload drawn whole (`renderPayload`), its repository and one line of gist (`eventGist`) for the
 * header and each row of its chain, and its badge's tone (`eventTone`).
 */

/** What the readers here take: an event as either read answers it. */
export interface EventLike {
  readonly name?: string;
  readonly payload?: string;
  readonly description?: string;
}

/**
 * Whether `event` is the project's: its payload names `projectId` (its `projectId`, or one of its
 * `entities[].projectId`), as the Events page's list is narrowed (`attr=projectid=…`). An event that
 * names no project, or another, is not.
 */
export function belongsToProject(event: EventLike, projectId: string | undefined): boolean {
  return !!projectId && payloadIds(event).projectIds.includes(projectId);
}

/**
 * An event's payload as its page draws it, whole:
 *
 * - `none`: no payload, or an empty one;
 * - `json`: it parsed; `text` is the value pretty-printed (two spaces) with every object's keys
 *   sorted (an array keeps its order) and its nulls kept;
 * - `raw`: it did not parse; `text` is the string exactly as it arrived.
 */
export type RenderedPayload =
  | { readonly kind: 'none' }
  | { readonly kind: 'json'; readonly text: string }
  | { readonly kind: 'raw'; readonly text: string };

/** The same value with every object's keys in sorted order; arrays keep theirs. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
    return sorted;
  }
  return value;
}

/** One payload, ready to draw ({@link RenderedPayload}). */
export function renderPayload(payload: string | null | undefined): RenderedPayload {
  if (payload == null || payload.trim().length === 0) return { kind: 'none' };
  try {
    return { kind: 'json', text: JSON.stringify(sortKeys(JSON.parse(payload)), null, 2) };
  } catch {
    return { kind: 'raw', text: payload };
  }
}

/** What an event's row says beyond its name and time: its repository and one line of gist. */
export interface EventGist {
  /** The repository the payload names (`repoName`, else `repository`), or null when none. */
  readonly repository: string | null;
  /** One line of gist; {@link NONE} when there is nothing to say. */
  readonly summary: string;
}

/** The two keys a payload names its repository by, the list's (`eventSubjects`) order. */
const REPOSITORY_KEYS = ['repoName', 'repository'] as const;

/** How many `key=value` pairs the fallback shows. */
const FALLBACK_PAIRS = 3;

/** A payload value as one short string: strings as they are, anything else as JSON. */
const text = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** The value at `key`, when there is one worth drawing. */
function at(payload: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  const drawn = text(value);
  return drawn.length > 0 ? drawn : null;
}

/** The parts that are there, joined by ` · `; {@link NONE} when none is. */
function join(parts: readonly (string | null)[]): string {
  const present = parts.filter((part): part is string => !!part);
  return present.length ? present.join(' · ') : NONE;
}

/**
 * An event's repository and gist. Three names get a line of their own: `BuildSuccessful` (branch ·
 * short commit), `SCMRelease` (version · branch) and `SoftwareRelease` (version · package type and
 * name). Any other name reads its `description` when it has one, else the first three `key=value`
 * pairs of its payload by key (the repository's key left out). A payload that is not a JSON object
 * reads the description, else says it is not JSON.
 */
export function eventGist(event: EventLike): EventGist {
  const payload = payloadOf(event);
  const description = event.description?.trim() || null;
  if (!payload) {
    return {
      repository: null,
      summary: description ?? (event.payload ? 'payload is not JSON' : NONE),
    };
  }
  const key = REPOSITORY_KEYS.find((candidate) => at(payload, candidate) !== null);
  const repository = key ? at(payload, key) : null;
  switch (event.name) {
    case 'BuildSuccessful':
      return {
        repository,
        summary: join([at(payload, 'branch'), at(payload, 'commitSha')?.slice(0, 7) ?? null]),
      };
    case 'SCMRelease':
      return { repository, summary: join([at(payload, 'version'), at(payload, 'branch')]) };
    case 'SoftwareRelease': {
      const pkg = [at(payload, 'packageType'), at(payload, 'packageName')].filter(Boolean);
      return {
        repository,
        summary: join([at(payload, 'version'), pkg.length ? pkg.join(' ') : null]),
      };
    }
    default: {
      if (description) return { repository, summary: description };
      const pairs = Object.keys(payload)
        .sort()
        .filter((candidate) => candidate !== key)
        .slice(0, FALLBACK_PAIRS)
        .map((candidate) => `${candidate}=${text(payload[candidate])}`);
      return { repository, summary: pairs.length ? pairs.join(' · ') : NONE };
    }
  }
}

/** A badge's tone: `info` for a release (`SCMRelease`, `SoftwareRelease`), else neutral. */
export function eventTone(name: string | undefined): 'info' | 'neutral' {
  return name === 'SCMRelease' || name === 'SoftwareRelease' ? 'info' : 'neutral';
}
