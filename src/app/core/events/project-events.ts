import type { ListEventsData } from '../../api/events';
import { PROJECT_EVENTS_PAGE } from './events.consumes';
import { repositoryEntry } from './project-event';
import { payloadIds, payloadOf, type WithPayload } from './refresh-on';

/**
 * The pure half of a project's Events page (qits-2312): what its filters ask qits-events for
 * (`projectEventsQuery`), how the filter box's text reads (`parseFilterText`), which live frames
 * belong in the list (`matchesProjectEvents`), and what each event concerns, with the landing page
 * it leads to (`eventSubjects`).
 */

/** The cursor id after every real one: `<until>,` this lists the events at or before `until`. */
export const UNTIL_CURSOR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/** How many `key=value` attributes the filter box sends besides the project's own. */
export const MAX_FILTER_ATTRS = 7;

/** The time presets: how far back the list reaches. */
export type SincePreset = 'any' | '1h' | '24h' | '7d';

/** Each preset, its label and how far back it reaches (null: no limit). */
export const SINCE_PRESETS: readonly {
  readonly value: SincePreset;
  readonly label: string;
  readonly ms: number | null;
}[] = [
  { value: 'any', label: 'Any time', ms: null },
  { value: '1h', label: '1 h', ms: 3_600_000 },
  { value: '24h', label: '24 h', ms: 86_400_000 },
  { value: '7d', label: '7 d', ms: 604_800_000 },
];

/** One `key=value` attribute of the filter box. */
export interface EventAttr {
  readonly key: string;
  readonly value: string;
}

/** The filter box's text, read: its attributes, the rest as free text, and what did not fit. */
export interface FilterText {
  /** The `key=value` tokens, at most {@link MAX_FILTER_ATTRS}, in order. */
  readonly attrs: readonly EventAttr[];
  /** Every other token, joined by one space; undefined when there is none. */
  readonly q?: string;
  /** How many `key=value` tokens past {@link MAX_FILTER_ATTRS} were left out. */
  readonly dropped: number;
}

/**
 * Reads the filter box: each whitespace-separated `key=value` token (a key without spaces or `=`,
 * a non-empty value) is an attribute, the first {@link MAX_FILTER_ATTRS} of them sent; every
 * other token is free text, sent as `q`.
 */
export function parseFilterText(text: string): FilterText {
  const attrs: EventAttr[] = [];
  const words: string[] = [];
  let dropped = 0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const match = /^([^=]+)=(.+)$/.exec(token);
    if (!match) {
      words.push(token);
    } else if (attrs.length < MAX_FILTER_ATTRS) {
      attrs.push({ key: match[1], value: match[2] });
    } else {
      dropped++;
    }
  }
  return { attrs, q: words.length ? words.join(' ') : undefined, dropped };
}

/** What the page's filters hold. */
export interface ProjectEventsFilter {
  /** The event names shown; none is every name. */
  readonly names: readonly string[];
  /** How far back the list reaches. */
  readonly since: SincePreset;
  /** The newest instant shown (ISO-8601), or undefined for up to now. */
  readonly until?: string;
  /** The filter box's text ({@link parseFilterText}). */
  readonly text: string;
}

/** No filter: every event of the project. */
export const NO_FILTER: ProjectEventsFilter = { names: [], since: 'any', text: '' };

/** The query `listEvents` is called with. */
export type ProjectEventsQuery = NonNullable<ListEventsData['query']>;

/**
 * The query for one page of `projectId`'s events under `filter`: `attr=projectid=<id>` and each
 * attribute of the filter box, `order=desc`, `limit=50`, and `name` (comma-separated), `since`
 * (now less the preset), `q` and `cursor` only when set. `cursor` is the next page's, else
 * `<until>,ffffffff-…` while "until" is set. `now` is the clock, so a spec pins it.
 */
export function projectEventsQuery(
  projectId: string,
  filter: ProjectEventsFilter,
  now: number,
  cursor?: string,
): ProjectEventsQuery {
  const text = parseFilterText(filter.text);
  const query: ProjectEventsQuery = {
    attr: [`projectid=${projectId}`, ...text.attrs.map(({ key, value }) => `${key}=${value}`)],
    limit: String(PROJECT_EVENTS_PAGE),
    order: 'desc',
  };
  if (filter.names.length) query.name = filter.names.join(',');
  const back = SINCE_PRESETS.find((preset) => preset.value === filter.since)?.ms;
  if (back) query.since = new Date(now - back).toISOString();
  if (text.q) query.q = text.q;
  const until = cursor ?? (filter.until ? `${filter.until},${UNTIL_CURSOR_ID}` : undefined);
  if (until) query.cursor = until;
  return query;
}

/** A payload value as text, for matching; undefined for an object or an array. */
const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

/** The payload's objects an attribute may be on: the payload, and each of its `entities[]`. */
function attrHolders(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>[] {
  const entities = Array.isArray(payload['entities'])
    ? payload['entities'].filter(
        (entity): entity is Record<string, unknown> => !!entity && typeof entity === 'object',
      )
    : [];
  return [payload, ...entities];
}

/** Whether `holder` has `attr`: a key equal to its key and a value equal to its value, either case. */
function hasAttr(holder: Readonly<Record<string, unknown>>, attr: EventAttr): boolean {
  const key = attr.key.toLowerCase();
  const value = attr.value.toLowerCase();
  return Object.entries(holder).some(
    ([k, v]) => k.toLowerCase() === key && textOf(v)?.toLowerCase() === value,
  );
}

/**
 * Whether a live frame belongs at the top of `projectId`'s list under `filter`: it names the
 * project (its payload's `projectId`, or one of its `entities[].projectId`), it is of a shown name,
 * its payload holds the free text (either case), and it carries every attribute of the filter box
 * (on the payload or one of its entities, key and value either case).
 */
export function matchesProjectEvents(
  event: WithPayload & { readonly name?: string },
  projectId: string,
  filter: ProjectEventsFilter,
): boolean {
  if (!payloadIds(event).projectIds.includes(projectId)) return false;
  if (filter.names.length && !filter.names.includes(event.name ?? '')) return false;
  const text = parseFilterText(filter.text);
  const raw = typeof event.payload === 'string' ? event.payload : '';
  if (text.q && !raw.toLowerCase().includes(text.q.toLowerCase())) return false;
  if (!text.attrs.length) return true;
  const holders = attrHolders(payloadOf(event) ?? {});
  return text.attrs.every((attr) => holders.some((holder) => hasAttr(holder, attr)));
}

/** A landing page an event's subject leads to. */
export type SubjectLink =
  | { readonly exit: 'releaseRequest'; readonly requestId: string }
  | { readonly exit: 'workItem'; readonly id: string };

/** One thing an event concerns: its kind, how it reads, and the page it leads to, if any. */
export interface EventSubject {
  readonly kind: 'repository' | 'release-request' | 'work-item' | 'branch' | 'agent';
  readonly label: string;
  readonly link?: SubjectLink;
}

/** A work item's qualified id, `<project slug>-<number>`; undefined without a number. */
function workId(projectSlug: string, number: unknown): string | undefined {
  const n = textOf(number);
  return n && /^\d+$/.test(n) ? `${projectSlug}-${n}` : undefined;
}

/**
 * What `event` concerns, from its payload, in this order: the repository (`repositoryEntry` from
 * `project-event.ts`: `repoName`, else `repositoryName`, else `repository`, a UUID-shaped value not
 * counting as a name; qits-2408), the release request (`releaseRequestQualifiedId`, leading to its
 * page by `releaseRequestId`), the work items (`EntityTransitioned`'s `entities[]`,
 * `EntityCommented`'s own `number`, each `<project slug>-<number>`, leading to its page), the
 * branch and the agent (`agentId`). None when the payload names none of them, or is not JSON.
 */
export function eventSubjects(
  event: WithPayload & { readonly name?: string },
  projectSlug: string,
): readonly EventSubject[] {
  const payload = payloadOf(event);
  if (!payload) return [];
  const subjects: EventSubject[] = [];
  const repository = repositoryEntry(payload)?.name ?? null;
  if (repository) subjects.push({ kind: 'repository', label: repository });
  const request = textOf(payload['releaseRequestQualifiedId']);
  const requestId = textOf(payload['releaseRequestId']);
  if (request || requestId) {
    subjects.push({
      kind: 'release-request',
      label: request ?? requestId ?? '',
      link: requestId ? { exit: 'releaseRequest', requestId } : undefined,
    });
  }
  const items =
    event.name === 'EntityTransitioned'
      ? attrHolders(payload)
          .slice(1)
          .map((entity) => workId(projectSlug, entity['number']))
      : event.name === 'EntityCommented'
        ? [workId(projectSlug, payload['number'])]
        : [];
  for (const id of new Set(items)) {
    if (id) subjects.push({ kind: 'work-item', label: id, link: { exit: 'workItem', id } });
  }
  const branch = textOf(payload['branch']);
  if (branch) subjects.push({ kind: 'branch', label: branch });
  const agent = textOf(payload['agentId']);
  if (agent) subjects.push({ kind: 'agent', label: agent.slice(0, 8) });
  return subjects;
}

/**
 * An event as its detail shows it: the envelope's fields, and the payload parsed from its JSON
 * string (kept as the string when it is not JSON), pretty-printed.
 */
export function eventDetail(event: {
  readonly id?: string;
  readonly name?: string;
  readonly occurredAt?: string;
  readonly publisher?: string;
  readonly environment?: string;
  readonly parentId?: string;
  readonly payload?: string;
}): string {
  let payload: unknown = event.payload ?? null;
  if (typeof event.payload === 'string') {
    try {
      payload = JSON.parse(event.payload);
    } catch {
      payload = event.payload;
    }
  }
  return JSON.stringify(
    {
      id: event.id ?? null,
      name: event.name ?? null,
      occurredAt: event.occurredAt ?? null,
      publisher: event.publisher ?? null,
      environment: event.environment ?? null,
      parentId: event.parentId ?? null,
      payload,
    },
    null,
    2,
  );
}

/**
 * The events to list: `arrived` (live, newest first), then `listed` (the pages read), each id once,
 * the first occurrence kept.
 */
export function mergeEvents<T extends { readonly id?: string }>(
  arrived: readonly T[],
  listed: readonly T[],
): readonly T[] {
  const seen = new Set<string | undefined>();
  return [...arrived, ...listed].filter((event) => !seen.has(event.id) && !!seen.add(event.id));
}
