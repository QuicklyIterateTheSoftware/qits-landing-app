import type { Freeze, FreezeRecord } from './routes-manifest';

/**
 * The data marks of a frozen page (qits-2141, read by the UI builder from qits-2144 on): which
 * read, which item of it and which attribute each marked part of a screenshot shows. Pages carry
 * them as attributes the `@qits/angular` data directives write, the freezer keeps them in the HTML,
 * and each freeze's `dataMarks` lists the visible ones. Everything without a mark is design copy.
 *
 * - `data-qits-source`: the read, `<provider>#<operationId>`;
 * - `data-qits-item`: one item of it, `<key>=<String(value)>`;
 * - `data-qits-field`: the attribute shown, a dot path inside the item;
 * - `data-qits-derived`: the attributes a shown value is computed from, space-separated paths.
 *
 * An element's source and item are its own or its nearest marked ancestor's (`closest`, which
 * includes the element); its field and derived paths are its own only. The freezer may also leak
 * the directives' inputs as plain attributes (`entitykey`, `qitsfield`): they are never read.
 */

/** One mark, as the manifest's `dataMarks` (and the freezer's `visibleDataMarks()`) write it. */
export interface DataMark {
  readonly source: string | null;
  readonly item: string | null;
  readonly field: string | null;
  readonly derived: readonly string[];
}

/** A mark resolved from an element of the frame, with what lies above it (qits-2144). */
export interface ElementMark extends DataMark {
  /** The item around the element's item (a wait inside an agent), searched first; null if none. */
  readonly outerItem: string | null;
  /**
   * The source of a list around the element's own source, when it is another read (a joined read,
   * `entitySource`); null when there is none or it is the same.
   */
  readonly joinedFrom: string | null;
}

export const SOURCE_ATTRIBUTE = 'data-qits-source';
export const ITEM_ATTRIBUTE = 'data-qits-item';
export const FIELD_ATTRIBUTE = 'data-qits-field';
export const DERIVED_ATTRIBUTE = 'data-qits-derived';

/** Every element that carries a mark of its own: what a pick in the frame resolves to. */
export const MARKED = `[${FIELD_ATTRIBUTE}],[${DERIVED_ATTRIBUTE}],[${ITEM_ATTRIBUTE}],[${SOURCE_ATTRIBUTE}]`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isDataMark = (value: unknown): value is DataMark =>
  isObject(value) &&
  isStringOrNull(value['source']) &&
  isStringOrNull(value['item']) &&
  isStringOrNull(value['field']) &&
  Array.isArray(value['derived']) &&
  value['derived'].every((path) => typeof path === 'string');

/**
 * A freeze's `dataMarks` as read (qits-2144): each well-formed entry with its four fields only, a
 * malformed one dropped; anything but a list (absent: a freeze that shows no mark, or an older
 * bundle) reads as none.
 */
export function readDataMarks(value: unknown): readonly DataMark[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDataMark).map(({ source, item, field, derived }) => ({
    source,
    item,
    field,
    derived: [...derived],
  }));
}

/** `<provider>#<operationId>`: the source a mark names for a read. */
export const sourceOf = ({
  provider,
  operationId,
}: Pick<FreezeRecord, 'provider' | 'operationId'>) => `${provider}#${operationId}`;

/** Whether two marks are the same: same source, item, field and derived paths. */
export const sameMark = (a: DataMark, b: DataMark) =>
  a.source === b.source &&
  a.item === b.item &&
  a.field === b.field &&
  a.derived.length === b.derived.length &&
  a.derived.every((path, i) => path === b.derived[i]);

/** The words of `element`'s `data-qits-derived`. */
const derivedOf = (element: Element) =>
  (element.getAttribute(DERIVED_ATTRIBUTE) ?? '').split(/\s+/).filter(Boolean);

/**
 * `element`'s mark by qits-2141's rule: source and item from the nearest element carrying one
 * (itself included), field and derived paths from itself. Also the item around its item and a
 * source above its own that differs (a joined read).
 */
export function markOf(element: Element): ElementMark {
  const sourced = element.closest(`[${SOURCE_ATTRIBUTE}]`);
  const itemed = element.closest(`[${ITEM_ATTRIBUTE}]`);
  const source = sourced?.getAttribute(SOURCE_ATTRIBUTE) ?? null;
  const above = sourced?.parentElement?.closest(`[${SOURCE_ATTRIBUTE}]`);
  const aboveSource = above?.getAttribute(SOURCE_ATTRIBUTE) ?? null;
  return {
    source,
    item: itemed?.getAttribute(ITEM_ATTRIBUTE) ?? null,
    field: element.getAttribute(FIELD_ATTRIBUTE),
    derived: derivedOf(element),
    outerItem: outerItemOf(itemed),
    joinedFrom: aboveSource !== null && aboveSource !== source ? aboveSource : null,
  };
}

/**
 * The item around `itemed`'s item: the nearest ancestor marking another record. An ancestor marking
 * the same record (a component's root `[qitsEntity]` inside the page's row for that record, as the
 * Agents route's `AgentRow` sits in its `<li>`) is the same item, not an outer one (qits-2144).
 */
function outerItemOf(itemed: Element | null): string | null {
  const own = itemed?.getAttribute(ITEM_ATTRIBUTE) ?? null;
  let above = itemed?.parentElement?.closest(`[${ITEM_ATTRIBUTE}]`);
  while (above && above.getAttribute(ITEM_ATTRIBUTE) === own) {
    above = above.parentElement?.closest(`[${ITEM_ATTRIBUTE}]`);
  }
  return above?.getAttribute(ITEM_ATTRIBUTE) ?? null;
}

/** An item mark split at its first `=`: `agentId=a=b` is `agentId` and `a=b`; null without `=`. */
export function parseItem(item: string): { readonly key: string; readonly value: string } | null {
  const at = item.indexOf('=');
  return at < 0 ? null : { key: item.slice(0, at), value: item.slice(at + 1) };
}

/**
 * The first object, depth first, whose `key` reads `value` as a string (`id=1` finds `{ id: 1 }`);
 * undefined when none does. Responses are wrapped (`{ agents: [...] }`, `{ entries: [{ workspace:
 * {...} }] }`), so the whole body is searched. With `within` (the item around it), the object of
 * that outer item is searched first, then the whole body; a `within` naming the item itself is
 * ignored, or a nested object sharing its key (an agent's wait carries its `agentId`) would win.
 */
export function findItem(
  json: unknown,
  key: string,
  value: string,
  within?: { readonly key: string; readonly value: string } | null,
): Record<string, unknown> | undefined {
  if (within && (within.key !== key || within.value !== value)) {
    const outer = findItem(json, within.key, within.value);
    const inner = outer === undefined ? undefined : findIn(outer, key, value, true);
    if (inner !== undefined) return inner;
  }
  return findIn(json, key, value, false);
}

function findIn(
  json: unknown,
  key: string,
  value: string,
  skipSelf: boolean,
): Record<string, unknown> | undefined {
  if (Array.isArray(json)) {
    for (const entry of json) {
      const found = findIn(entry, key, value, false);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isObject(json)) return undefined;
  if (!skipSelf && key in json && scalarText(json[key]) === value) return json;
  for (const child of Object.values(json)) {
    const found = findIn(child, key, value, false);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `value` as `String(value)` would write it, for a scalar; null for an object or an array. */
const scalarText = (value: unknown): string | null =>
  value !== null && typeof value === 'object' ? null : String(value);

/** What a path reads in a recorded object: its value as text, or that the answer lacks it. */
export type PathValue =
  | { readonly found: true; readonly text: string }
  | { readonly found: false; readonly text: 'not in the recorded answer' };

const ABSENT: PathValue = { found: false, text: 'not in the recorded answer' };

/**
 * The value at the dot path `path` of `object` (qits-2144): a string as it is, any other scalar as
 * `String`, an array or object as compact JSON; absent says so (a derived input the UI joins in,
 * such as an agent's `waits`, is not in the answer).
 */
export function valueAt(object: unknown, path: string): PathValue {
  let at: unknown = object;
  for (const part of path.split('.')) {
    if (Array.isArray(at) && /^\d+$/.test(part)) at = at[Number(part)];
    else if (isObject(at) && part in at) at = at[part];
    else return ABSENT;
  }
  if (at === undefined) return ABSENT;
  return { found: true, text: typeof at === 'string' ? at : JSON.stringify(at) };
}

/**
 * Which recorded call a mark reads (qits-2144), and how sure that is:
 *
 * - `marked`: the one record its source names (several, told apart by the item);
 * - `ambiguous`: several records answer its source and the item does not tell them apart, or none
 *   of the freeze's records answers it;
 * - `byItem`: it names no source, and exactly one record's answer holds its item;
 * - `none`: it names no source, and no single record's answer holds its item.
 *
 * `loading` while an answer that decides it is still being read.
 */
export type MarkRead =
  | { readonly kind: 'marked' | 'byItem'; readonly record: FreezeRecord }
  | { readonly kind: 'ambiguous'; readonly records: readonly FreezeRecord[] }
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' };

/** Reads a record's recorded answer: the body, null when there is none, undefined while read. */
export type Responses = (record: FreezeRecord) => unknown;

/**
 * The item object a mark points at in `body`, the item inside its outer one first; undefined when
 * the mark has no item or the body lacks it.
 */
export function itemIn(
  body: unknown,
  mark: Pick<ElementMark, 'item'> & Partial<Pick<ElementMark, 'outerItem'>>,
): Record<string, unknown> | undefined {
  const item = mark.item === null ? null : parseItem(mark.item);
  if (!item) return undefined;
  const outer = mark.outerItem ? parseItem(mark.outerItem) : null;
  return findItem(body, item.key, item.value, outer);
}

/** The records of `freeze`, once each by provider, operation and state. */
function distinctRecords(freeze: Freeze): readonly FreezeRecord[] {
  const seen = new Map<string, FreezeRecord>();
  for (const record of freeze.records) {
    seen.set(JSON.stringify([record.provider, record.operationId, record.state]), record);
  }
  return [...seen.values()];
}

/**
 * The record of `freeze` a mark reads (qits-2144). Its candidates are the records whose
 * `<provider>#<operationId>` is the mark's source: one is it; several are told apart by which
 * recorded answer holds the item (`responses`). A mark without a source searches every record's
 * answer for its item. See {@link MarkRead} for what each outcome means.
 */
export function recordFor(
  freeze: Freeze,
  mark: Pick<ElementMark, 'source' | 'item'> & Partial<Pick<ElementMark, 'outerItem'>>,
  responses: Responses,
): MarkRead {
  const records = distinctRecords(freeze);
  if (mark.source !== null) {
    const candidates = records.filter((record) => sourceOf(record) === mark.source);
    if (candidates.length === 1) return { kind: 'marked', record: candidates[0] };
    if (!candidates.length || mark.item === null) return { kind: 'ambiguous', records: candidates };
    const hits = holding(candidates, mark, responses);
    if (hits === 'loading') return { kind: 'loading' };
    return hits.length === 1
      ? { kind: 'marked', record: hits[0] }
      : { kind: 'ambiguous', records: candidates };
  }
  if (mark.item === null) return { kind: 'none' };
  const hits = holding(records, mark, responses);
  if (hits === 'loading') return { kind: 'loading' };
  return hits.length === 1 ? { kind: 'byItem', record: hits[0] } : { kind: 'none' };
}

/** The records whose answer holds the mark's item; `loading` while one is still read. */
function holding(
  records: readonly FreezeRecord[],
  mark: Pick<ElementMark, 'item'> & Partial<Pick<ElementMark, 'outerItem'>>,
  responses: Responses,
): readonly FreezeRecord[] | 'loading' {
  const hits: FreezeRecord[] = [];
  for (const record of records) {
    const body = responses(record);
    if (body === undefined) return 'loading';
    if (itemIn(body, mark) !== undefined) hits.push(record);
  }
  return hits;
}
