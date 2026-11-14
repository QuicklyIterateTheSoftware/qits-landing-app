import type { DataMark } from './data-marks';
import type { Freeze, FreezeColorScheme, FreezeNetwork, FreezeViewport } from './routes-manifest';

/** What the UI builder had selected when a prompt was sent: an entity, a data mark, or nothing. */
export type OpenedSelection =
  | { readonly kind: 'entity'; readonly name: string }
  | { readonly kind: 'mark'; readonly mark: DataMark }
  | null;

/** What the UI builder shows at the moment of sending, read off the page's signals. */
export interface OpenedContextFields {
  /** The repository the URL names (the page's `repo`). */
  readonly repository: string;
  /** The selected route's full path, as `manifest.json` writes it; null when none is selected. */
  readonly route: string | null;
  /** The loaded `@routes/` bundle's version; null before it is loaded. */
  readonly manifestVersion: string | null;
  /** The drawn freeze; null when the route shows none. */
  readonly freeze: Pick<
    Freeze,
    'file' | 'kind' | 'viewport' | 'colorScheme' | 'connectivity'
  > | null;
  /**
   * What the switches ask for, which name the screenshot while none is drawn: the viewport, the
   * scheme and the network (null for a bundle without offline shots, which is online).
   */
  readonly asked: {
    readonly viewport: FreezeViewport;
    readonly colorScheme: FreezeColorScheme;
    readonly network: FreezeNetwork | null;
  };
  readonly selection: OpenedSelection;
}

/** A value of the block, or `none` when the page has none. */
const orNone = (value: string | null | undefined): string =>
  value === null || value === undefined || value === '' ? 'none' : value;

/**
 * A data mark as the block names it (qits-2141's directives): `qitsField` for a mark with a field
 * or derived paths, `qitsEntity` for one with an item, else `qitsEntityList`; then its source, item
 * and field, each when it has one. A derived mark's inputs have no place in the format.
 */
function markWords(mark: DataMark): string {
  const directive =
    mark.field !== null || mark.derived.length > 0
      ? 'qitsField'
      : mark.item !== null
        ? 'qitsEntity'
        : 'qitsEntityList';
  return ['mark', directive, orNone(mark.source), mark.item, mark.field]
    .filter((part): part is string => part !== null)
    .join(' ');
}

/** The selection line's value: `none`, `entity <name>` or `mark <directive> <source>[ …]`. */
function selectionWords(selection: OpenedSelection): string {
  if (selection === null) return 'none';
  return selection.kind === 'entity' ? `entity ${selection.name}` : markWords(selection.mark);
}

/**
 * The prompt the UI builder's agent dialog sends (qits-2157): the `<opened-context>` block whose
 * format qits-2156 fixes (section C; the ui-builder agent's briefing reads it), one field a line,
 * then a blank line, then the person's `text` as typed.
 *
 * - The screenshot's kind, viewport, colour scheme and connectivity are the **drawn freeze's**, as
 *   a pitch names that screenshot; without a freeze, the switches' viewport, scheme and network,
 *   and kind `none`.
 * - Connectivity is `online` for a bundle without offline shots.
 * - Selection: the Entities tab's entity, else the data mark highlighted, else `none` (a selected
 *   call has no form in the format).
 * - Any field without a value reads `none`.
 */
export function openedContext(fields: OpenedContextFields, text: string): string {
  const { freeze, asked } = fields;
  // A freeze without `connectivity` counts as ONLINE, as `freezeNetwork` reads it.
  const network = freeze ? (freeze.connectivity?.network ?? 'ONLINE') : (asked.network ?? 'ONLINE');
  const lines = [
    '<opened-context>',
    `repository: ${orNone(fields.repository)}`,
    `route: ${orNone(fields.route)}`,
    `manifestVersion: ${orNone(fields.manifestVersion)}`,
    `screenshot: ${orNone(freeze?.file)}`,
    `kind: ${orNone(freeze ? freeze.kind : null)}`,
    `viewport: ${orNone(freeze ? freeze.viewport : asked.viewport)}`,
    `colorScheme: ${orNone(freeze ? freeze.colorScheme : asked.colorScheme)}`,
    `connectivity: ${network.toLowerCase()}`,
    `selection: ${selectionWords(fields.selection)}`,
    '</opened-context>',
  ];
  return `${lines.join('\n')}\n\n${text}`;
}
