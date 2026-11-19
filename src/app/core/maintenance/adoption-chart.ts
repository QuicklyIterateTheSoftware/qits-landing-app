import type { Adopter } from './maintenance.consumes';

/**
 * The adoption page's flowchart (qits-2333, ported from qits-maintenance-frontend's
 * `AdoptionPage.chart`): one release and everything downstream of it, laid out left to right, as
 * a pure function of the answer.
 *
 * The geometry, in pixels, is decided here and nowhere else. The layout is arithmetic rather than
 * measurement, and that is deliberate: the only other way to draw an edge between two cards is to
 * render them, measure them and draw again, a second layout pass, a resize listener and a number
 * that reads as zero under jsdom. Fixed cards mean every coordinate is known before the first
 * paint, an edge's `d` is a pure function of two integers, and a spec can assert where a card
 * landed without a browser. The cost is a card that cannot grow to fit its content, which is why
 * names ellipsis with their full text in a `title`: a reader recognises a repository from its
 * head, and a column of cards of different heights would make the edges harder to follow.
 */
export const CARD_WIDTH = 240;
export const CARD_HEIGHT = 116;

/** The space between two columns: the width every edge has to make its turn in. */
export const COLUMN_GAP = 84;

export const ROW_GAP = 16;

/** The band above the cards that the per-column header sits in. */
export const HEADER_HEIGHT = 46;

/** One column of the flowchart: everything at one distance from the release. */
export interface ChartColumn {
  readonly key: string;
  readonly depth: number;
  readonly x: number;
  /** How far away this column is, in words. */
  readonly label: string;
  /** How much of this column carries the release (`x/y carrying it`); none on the release's own. */
  readonly summary: string;
}

/** One card: the release itself, or one repository downstream of it. */
export interface ChartNode {
  readonly key: string;
  readonly repository: string;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  /** The subject of the page rather than an adopter of it: drawn once, in column zero. */
  readonly root: boolean;
  /** Whether the inventory holds the repository (`repositoryStatus` `OK`), so its page exists. */
  readonly linkable: boolean;
  /** The repository left the catalog (`ABSENT`): it will never take this release. */
  readonly absent: boolean;
  readonly archetype: string;
  /** The adoption verdict (ADOPTED, PENDING), or null on the root card, which is the release. */
  readonly state: string | null;
  readonly adopted: boolean;
  /** The release this card is about: the subject on the root, the adopting one on an adopter. */
  readonly version: string;
  /** What a pending card is waiting for, in words; nothing on an adopted card or the root. */
  readonly note: string;
  readonly adoptedAt: string | null;
  /**
   * The cards with an edge into this one, joined. For a screen reader only: the edges say this to
   * the eye, but an edge is a `<path>` and reads as nothing without sight.
   */
  readonly reachedFrom: string;
}

/** One edge, resolved to the two cards it joins and the curve between them. */
export interface ChartEdge {
  readonly key: string;
  /** The repository at the tail and at the head, also on the `<path>` so the SVG is debuggable. */
  readonly from: string;
  readonly to: string;
  readonly path: string;
  /** Whether the card this edge arrives at carries the release. */
  readonly adopted: boolean;
}

/** The whole drawing, and the box it needs. */
export interface AdoptionChart {
  readonly columns: readonly ChartColumn[];
  readonly nodes: readonly ChartNode[];
  readonly edges: readonly ChartEdge[];
  readonly width: number;
  readonly height: number;
}

/** What the chart is drawn from: the answer's release, its adopters. */
export interface ChartInput {
  readonly repository?: string | null;
  readonly version?: string | null;
  readonly adopters?: readonly Adopter[] | null;
}

const EMPTY_CHART: AdoptionChart = { columns: [], nodes: [], edges: [], width: 0, height: 0 };

/** Shown where a card has no value to say. */
const NONE = '–';

/** Where a column's left edge sits. */
export function columnX(column: number): number {
  return column * (CARD_WIDTH + COLUMN_GAP);
}

/** Where a row's top edge sits, under the band the column headers occupy. */
export function rowY(row: number): number {
  return HEADER_HEIGHT + row * (CARD_HEIGHT + ROW_GAP);
}

/**
 * A cubic from one card's right edge to another card's left edge. The control points sit half the
 * horizontal distance out from each end, so the curve leaves and arrives horizontally; the floor
 * under that half keeps an edge that climbs several rows inside one column gap from collapsing
 * into a straight diagonal.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const reach = Math.max(28, Math.round((x2 - x1) / 2));
  return `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`;
}

/** `n word` or `n words`. */
export function plural(count: number, word: string, words = `${word}s`): string {
  return `${count} ${count === 1 ? word : words}`;
}

/**
 * How far away a column is, in words: short, because it is a column header; the edges say through
 * what, and the column's position says the rest.
 */
export function depthLabel(depth: number): string {
  return depth === 0 ? 'This release' : `${plural(depth, 'hop')} downstream`;
}

/** The caption above the chart: how many repositories are downstream, how many carry it. */
export function adoptionCaption(adopters: readonly Adopter[]): string {
  const adopted = adopters.filter((adopter) => adopter.state === 'ADOPTED').length;
  return (
    `${plural(adopters.length, 'repository', 'repositories')} downstream of this release, ` +
    `${adopted} carrying it.`
  );
}

/**
 * Where a card wants to sit in its column: level with the parents that feed it, the mean of their
 * rows, so a card with two parents sits between them. A card whose parents this answer does not
 * contain sorts to the end: there is nothing to be level with.
 */
function orderOf(adopter: Adopter, rowOf: ReadonlyMap<string, number>): number {
  const rows: number[] = [];
  if ((adopter.depth ?? 0) <= 1) rows.push(0);
  for (const parent of adopter.via ?? []) {
    const row = rowOf.get(parent);
    if (row !== undefined) rows.push(row);
  }
  if (rows.length === 0) return Number.MAX_SAFE_INTEGER;
  return rows.reduce((total, row) => total + row, 0) / rows.length;
}

/**
 * What a pending card is still waiting for, or nothing. An adopted card says its version and its
 * moment instead. A pending card one hop out waits on nothing but its own next release; a deeper
 * one waits on the cards its edges come from, which the drawing already shows. (The old "waiting
 * behind a → b" misread `via`, the set of all parents, as a chain.)
 */
function noteFor(adopter: Adopter): string {
  if (adopter.state === 'ADOPTED') return '';
  return (adopter.depth ?? 0) <= 1 ? 'has not released with it yet' : 'waiting';
}

/**
 * The flowchart: cards on a grid of hops, and the curves between them.
 *
 * - **A DAG, not a tree.** Two upstreams can both lead to one repository, and the service decides
 *   it once; so it is one card with an edge in from every parent, never a copy under each.
 * - **One column per hop.** Column zero is the release; column n holds the repositories at the
 *   n-th distinct depth the answer names.
 * - **The rows in a column are ordered here**, the one place the page re-orders what the service
 *   sent: a card sits at the mean row of its parents, ties broken by name, so edges stay short and
 *   stop crossing for no reason. Nothing beyond "depth ascending" is assumed of the service; a
 *   depth-1 card's only parent is the release, so that column falls back to name order.
 * - **Every lookup is by name, and a name that resolves to nothing is dropped.** A truncated
 *   closure can name a parent it never sent: that edge is not drawn (a curve into empty space),
 *   the card at its head still is. A depth-1 card always hangs off the release, whatever `via`
 *   says, and only once.
 *
 * `fallback` is the release the address names, for an answer that leaves its own out.
 */
export function adoptionChart(
  journey: ChartInput | null | undefined,
  fallback: { readonly repository: string; readonly version: string },
): AdoptionChart {
  const adopters = journey?.adopters ?? [];
  if (adopters.length === 0) return EMPTY_CHART;
  const rootName = journey?.repository || fallback.repository;

  // One card per repository: a duplicate would put two cards under one name, and the second would
  // collect the edges the first had already claimed.
  const byDepth = new Map<number, Adopter[]>();
  const claimed = new Set<string>([rootName]);
  for (const adopter of adopters) {
    const name = adopter.repository;
    if (!name || claimed.has(name)) continue;
    claimed.add(name);
    // A depth the service never sends (zero, negative) would land a card on the release itself.
    const depth = Math.max(1, adopter.depth ?? 1);
    const at = byDepth.get(depth);
    if (at) at.push(adopter);
    else byDepth.set(depth, [adopter]);
  }

  const depths = [...byDepth.keys()].sort((left, right) => left - right);
  const rowOf = new Map<string, number>([[rootName, 0]]);
  const columnOf = new Map<string, number>([[rootName, 0]]);
  const placed: { readonly adopter: Adopter; readonly column: number; readonly row: number }[] = [];
  const columns: ChartColumn[] = [
    { key: 'depth-0', depth: 0, x: columnX(0), label: depthLabel(0), summary: '' },
  ];

  depths.forEach((depth, index) => {
    const column = index + 1;
    const at = byDepth.get(depth) ?? [];
    const ordered = at
      .map((adopter) => ({ adopter, order: orderOf(adopter, rowOf) }))
      .sort(
        (left, right) =>
          left.order - right.order ||
          (left.adopter.repository ?? '').localeCompare(right.adopter.repository ?? ''),
      );
    ordered.forEach(({ adopter }, row) => {
      const name = adopter.repository ?? '';
      rowOf.set(name, row);
      columnOf.set(name, column);
      placed.push({ adopter, column, row });
    });
    const adopted = at.filter((adopter) => adopter.state === 'ADOPTED').length;
    columns.push({
      key: `depth-${depth}`,
      depth,
      x: columnX(column),
      label: depthLabel(depth),
      summary: `${adopted}/${at.length} carrying it`,
    });
  });

  const edges: ChartEdge[] = [];
  const parentsOf = new Map<string, string[]>();
  for (const { adopter, column, row } of placed) {
    const name = adopter.repository ?? '';
    const via = adopter.via ?? [];
    const parents: string[] = [];
    const candidates = (adopter.depth ?? 0) <= 1 ? [rootName, ...via] : via;
    for (const parent of candidates) {
      const parentColumn = columnOf.get(parent);
      if (parentColumn === undefined || parent === name || parents.includes(parent)) continue;
      parents.push(parent);
      edges.push({
        key: `${parent}->${name}`,
        from: parent,
        to: name,
        path: edgePath(
          columnX(parentColumn) + CARD_WIDTH,
          rowY(rowOf.get(parent) ?? 0) + CARD_HEIGHT / 2,
          columnX(column),
          rowY(row) + CARD_HEIGHT / 2,
        ),
        adopted: adopter.state === 'ADOPTED',
      });
    }
    parentsOf.set(name, parents);
  }

  const nodes: ChartNode[] = [
    {
      key: `0|${rootName}`,
      repository: rootName,
      column: 0,
      row: 0,
      x: columnX(0),
      y: rowY(0),
      root: true,
      linkable: false,
      absent: false,
      archetype: '',
      state: null,
      adopted: false,
      version: journey?.version || fallback.version,
      note: '',
      adoptedAt: null,
      reachedFrom: '',
    },
    ...placed.map(({ adopter, column, row }): ChartNode => {
      const name = adopter.repository ?? '';
      return {
        key: `${column}|${name}`,
        repository: name,
        column,
        row,
        x: columnX(column),
        y: rowY(row),
        root: false,
        linkable: adopter.repositoryStatus === 'OK',
        absent: adopter.repositoryStatus === 'ABSENT',
        archetype: adopter.archetype || NONE,
        state: adopter.state ?? null,
        adopted: adopter.state === 'ADOPTED',
        version: adopter.adoptedVersion ?? NONE,
        note: noteFor(adopter),
        adoptedAt: adopter.adoptedAt ?? null,
        reachedFrom: (parentsOf.get(name) ?? []).join(', '),
      };
    }),
  ];

  // The tallest column decides the height; the floor of one keeps a lone adopter's box positive.
  const tallest = Math.max(1, ...depths.map((depth) => byDepth.get(depth)?.length ?? 0));
  return {
    columns,
    nodes,
    edges,
    width: columnX(columns.length - 1) + CARD_WIDTH,
    height: rowY(tallest - 1) + CARD_HEIGHT,
  };
}
