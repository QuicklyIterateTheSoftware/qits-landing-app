/**
 * Which column of the process page's steps board each step goes in (qits-2359), ported from
 * qits-orchestrator-frontend's `board/layout.ts` without its wires: the old board drew SVG lines
 * between the cards, which this app leaves out (each card's detail lists what it depends on).
 *
 * Every function here is pure: steps in, columns out, so the arrangement is asserted from plain
 * arrays (`step-columns.spec.ts`) and the page only renders it.
 */

/** What the arrangement needs to know about a step: its id, and what it waits for. */
export interface GraphNode {
  readonly id?: string;
  readonly dependsOn?: readonly string[];
}

/**
 * The column each step belongs in: its dependency depth. Depth 0 waits for nothing; otherwise it
 * is one more than the deepest step it waits for, so a column is everything that could start at
 * the same moment, and every dependency points to a column on the left.
 *
 * Two defences, for graphs a service could send and a reader would still have to look at:
 *
 * - A dependency naming a step that is not here is ignored: it adds no depth rather than breaking
 *   the page.
 * - A cycle resolves rather than recursing forever: a step already being visited counts as depth
 *   0 for the step asking about it, so a cycle lands its members in adjacent columns and the board
 *   still renders. A cycle would be a defect in the process definition, and a blank page the worst
 *   way to report one.
 */
export function depths(nodes: readonly GraphNode[]): ReadonlyMap<string, number> {
  const byId = new Map(nodes.map((node) => [node.id ?? '', node]));
  const known = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    const cached = known.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || visiting.has(id)) return 0;
    visiting.add(id);
    let depth = 0;
    for (const dependency of node.dependsOn ?? []) {
      if (byId.has(dependency)) depth = Math.max(depth, depthOf(dependency) + 1);
    }
    visiting.delete(id);
    known.set(id, depth);
    return depth;
  };

  for (const node of nodes) depthOf(node.id ?? '');
  return known;
}

/**
 * The steps of each column, left to right. Within a column the steps keep the order the service
 * listed them in, never sorted: that order is the process definition's own and the order they run
 * in (sorting by name would put `usage.after` above `usage.before`).
 */
export function columns<T extends GraphNode>(nodes: readonly T[]): readonly (readonly T[])[] {
  const depth = depths(nodes);
  const byColumn: T[][] = [];
  for (const node of nodes) (byColumn[depth.get(node.id ?? '') ?? 0] ??= []).push(node);
  // Only a cycle leaves a column empty (its members start at depth 1); the fallback keeps that
  // hole from ever reaching a template as `undefined`.
  return Array.from(byColumn, (column) => column ?? []);
}
