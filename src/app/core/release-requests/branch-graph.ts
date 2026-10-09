import type { CommitGraph, GraphEdge, GraphRow } from './commit-graph';

/**
 * A release request's fold as a branch graph, from the commits' parents (qits-projects'
 * `listReleaseRequestCommits`: `commits[].parents` and `.fold`, `sources[].tipSha`,
 * `foldParents`): one fixed lane per line of history, like a git flow diagram.
 *
 * - The first lane is the backing branch (`release/<id>`): the request's fold merges (`fold`),
 *   a chain of first parents from `mergedSha`, one per re-fold. Only the newest shows unless
 *   `showEarlierFolds`; the rest are counted.
 * - Then one lane per source that owns a commit of the list, in the sources' order. A commit
 *   belongs to the first source (in that order) whose tip reaches it, walking parents but never
 *   through a fold merge. A commit no source reaches goes to a last lane, "other". A source that
 *   owns no commit (main, say, whose tip is the base) gets no lane: it is in `emptySources`.
 * - The newest fold, collapsed, draws a line into each source lane's newest commit that any fold
 *   of the chain merged, so the branches are seen being pulled in. Shown earlier folds keep their
 *   real parents. A source tip no fold merged (pushed after the newest fold) is `notYetFolded`.
 */

/** A commit as the branch layout reads it. */
export interface BranchCommit {
  readonly hash: string;
  readonly parents: readonly string[];
  /** The request's own fold merges; absent: the first-parent chain of merges decides. */
  readonly fold?: boolean;
}

/** A source branch of the request, as the commits answer names it, in source order. */
export interface BranchSource {
  readonly name: string;
  /** The branch's tip now (it may be newer than what the newest fold merged); null: unknown. */
  readonly tipSha?: string | null;
}

/** One lane: its label, and whose line it is. */
export interface BranchLane {
  readonly label: string;
  readonly kind: 'backing' | 'source' | 'other';
}

/** The branch graph: the drawn graph, its lanes, the shown commits and the hidden folds. */
export interface BranchGraph extends CommitGraph {
  readonly lanes: readonly BranchLane[];
  /** Sources that own no commit of the list: no lane, but still a header. */
  readonly emptySources: readonly string[];
  /** Source tips no fold has merged yet, by hash. */
  readonly notYetFolded: ReadonlySet<string>;
  /** The hashes of the shown commits, in row order. */
  readonly shown: readonly string[];
  /** How many earlier fold merges are hidden (0 when shown). */
  readonly hiddenFolds: number;
  /** How many earlier fold merges there are. */
  readonly earlierFolds: number;
}

/** Whether the commits carry what the branch layout needs: parents on every commit. */
export function hasParents(
  commits: readonly { readonly parents?: readonly string[] | null }[],
): boolean {
  return commits.length > 0 && commits.every((commit) => Array.isArray(commit.parents));
}

/** The request's fold merges, newest first: the first-parent chain of merges from `mergedSha`. */
export function foldChain(commits: readonly BranchCommit[], mergedSha: string): readonly string[] {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const marked = commits.some((commit) => commit.fold !== undefined);
  const chain: string[] = [];
  let at = byHash.get(mergedSha);
  while (at && (marked ? at.fold === true : at.parents.length > 1)) {
    chain.push(at.hash);
    at = byHash.get(at.parents[0]);
  }
  return chain;
}

/**
 * Lays out the fold of a request: `commits` newest first with their parents, `mergedSha` the
 * newest fold, `backingBranch` its branch, `sources` its source branches in order.
 */
export function branchGraph(input: {
  readonly commits: readonly BranchCommit[];
  readonly mergedSha: string;
  readonly backingBranch: string;
  readonly sources: readonly BranchSource[];
  readonly showEarlierFolds?: boolean;
}): BranchGraph {
  const { commits, sources } = input;
  const listed = new Set(commits.map((commit) => commit.hash));
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const folds = foldChain(commits, input.mergedSha);
  const foldSet = new Set(folds);

  // The first source, in order, whose tip reaches a commit owns it.
  const owner = new Map<string, number>();
  sources.forEach((source, index) => {
    const start = source.tipSha;
    if (!start || !listed.has(start) || foldSet.has(start)) return;
    const stack = [start];
    while (stack.length > 0) {
      const hash = stack.pop()!;
      if (owner.has(hash)) continue;
      owner.set(hash, index);
      for (const parent of byHash.get(hash)?.parents ?? []) {
        if (listed.has(parent) && !foldSet.has(parent) && !owner.has(parent)) stack.push(parent);
      }
    }
  });

  const used = sources.flatMap((source, index) =>
    [...owner.values()].includes(index) ? [index] : [],
  );
  const laneOfSource = new Map(used.map((index, position) => [index, position + 1]));
  const otherLane = used.length + 1;
  const unowned = commits.some((commit) => !foldSet.has(commit.hash) && !owner.has(commit.hash));
  const lanes: BranchLane[] = [
    { label: input.backingBranch, kind: 'backing' },
    ...used.map((index): BranchLane => ({ label: sources[index].name, kind: 'source' })),
    ...(unowned ? [{ label: 'other', kind: 'other' } as BranchLane] : []),
  ];
  const laneOf = (hash: string) => {
    if (foldSet.has(hash)) return 0;
    const index = owner.get(hash);
    return index === undefined ? otherLane : laneOfSource.get(index)!;
  };

  // What the folds merged: every parent of a fold that is not the previous fold.
  const merged = new Set(
    folds.flatMap((fold) => (byHash.get(fold)?.parents ?? []).filter((p) => !foldSet.has(p))),
  );
  const reachable = new Set<string>();
  for (const start of merged) {
    const stack = [start];
    while (stack.length > 0) {
      const hash = stack.pop()!;
      if (reachable.has(hash) || !listed.has(hash)) continue;
      reachable.add(hash);
      stack.push(...(byHash.get(hash)?.parents ?? []));
    }
  }
  const notYetFolded = new Set(
    sources.flatMap((source) =>
      source.tipSha && listed.has(source.tipSha) && !reachable.has(source.tipSha)
        ? [source.tipSha]
        : [],
    ),
  );

  const showEarlier = input.showEarlierFolds === true;
  const shownCommits = commits.filter(
    (commit) => !foldSet.has(commit.hash) || commit.hash === folds[0] || showEarlier,
  );
  // Collapsed, the newest fold pulls in each lane's newest merged commit.
  const pulled: string[] = [];
  const pulledLanes = new Set<number>();
  for (const commit of commits) {
    if (!merged.has(commit.hash) || !listed.has(commit.hash)) continue;
    const lane = laneOf(commit.hash);
    if (pulledLanes.has(lane)) continue;
    pulledLanes.add(lane);
    pulled.push(commit.hash);
  }
  const parentsOf = (commit: BranchCommit): readonly string[] =>
    commit.hash === folds[0] && !showEarlier ? pulled : commit.parents;

  const graph = fixedLaneLayout(
    shownCommits.map((commit) => ({
      hash: commit.hash,
      lane: laneOf(commit.hash),
      parents: parentsOf(commit),
    })),
    lanes.length,
  );
  const earlierFolds = Math.max(0, folds.length - 1);
  return {
    ...graph,
    lanes,
    emptySources: sources.flatMap((source, index) => (used.includes(index) ? [] : [source.name])),
    notYetFolded,
    shown: shownCommits.map((commit) => commit.hash),
    earlierFolds,
    hiddenFolds: showEarlier ? 0 : earlierFolds,
  };
}

/** A commit placed in a fixed lane. */
export interface PlacedCommit {
  readonly hash: string;
  readonly lane: number;
  readonly parents: readonly string[];
}

/**
 * Draws commits in fixed lanes, newest first. A line runs from each commit to each shown parent:
 * straight down in the commit's lane, or curving into the parent's lane in the commit's row and
 * then straight down that lane to the parent. A parent not shown draws nothing.
 */
export function fixedLaneLayout(commits: readonly PlacedCommit[], width: number): CommitGraph {
  const rowOf = new Map(commits.map((commit, index) => [commit.hash, index]));
  // Each line below a row, as (lane, from row, to row): the lane is drawn between them.
  const spans: { lane: number; from: number; to: number }[] = [];
  const edgesOf: GraphEdge[][] = commits.map(() => []);
  commits.forEach((commit, row) => {
    const targets = new Set<number>();
    for (const parent of commit.parents) {
      const to = rowOf.get(parent);
      if (to === undefined || to <= row) continue;
      const lane = commits[to].lane;
      spans.push({ lane, from: row, to });
      if (!targets.has(lane)) {
        targets.add(lane);
        edgesOf[row].push({ from: commit.lane, to: lane });
      }
    }
  });
  const rows: GraphRow[] = commits.map((commit, row) => {
    const crossing = spans.filter((span) => span.from < row && row < span.to);
    const ownThrough = crossing.some((span) => span.lane === commit.lane);
    const incoming =
      ownThrough || spans.some((span) => span.to === row && span.lane === commit.lane);
    const edges = [...edgesOf[row]];
    if (ownThrough && !edges.some((edge) => edge.from === commit.lane && edge.to === commit.lane)) {
      edges.push({ from: commit.lane, to: commit.lane });
    }
    const passing = [
      ...new Set(crossing.filter((span) => span.lane !== commit.lane).map((span) => span.lane)),
    ].sort((a, b) => a - b);
    const below = [
      ...new Set(
        spans.filter((span) => span.from <= row && row < span.to).map((span) => span.lane),
      ),
    ].sort((a, b) => a - b);
    return {
      hash: commit.hash,
      lane: commit.lane,
      incoming,
      converging: [],
      passing,
      edges,
      below,
    };
  });
  return { rows, width };
}

/**
 * The commits before they carry parents: one plain lane under the backing branch, newest first,
 * and every source without a lane of its own (no commit can be placed on a branch without
 * parents).
 */
export function guessedGraph(input: {
  readonly commits: readonly { readonly hash: string }[];
  readonly backingBranch: string;
  readonly sources: readonly BranchSource[];
}): BranchGraph {
  const hashes = input.commits.map((commit) => commit.hash);
  const graph = fixedLaneLayout(
    hashes.map((hash, index) => ({
      hash,
      lane: 0,
      parents: index + 1 < hashes.length ? [hashes[index + 1]] : [],
    })),
    1,
  );
  return {
    ...graph,
    lanes: [{ label: input.backingBranch, kind: 'backing' }],
    emptySources: input.sources.map((source) => source.name),
    notYetFolded: new Set(),
    shown: hashes,
    earlierFolds: 0,
    hiddenFolds: 0,
  };
}
