import {
  inferLanes,
  type CommitGraph,
  type GraphEdge,
  type GraphRow,
  type InferredCommit,
} from './commit-graph';

/**
 * A release request's fold as a branch graph, from the commits' parents: one fixed lane per line
 * of history, like a git flow diagram.
 *
 * - Lane 0 is the backing branch (`release/<id>`): the first-parent chain of fold merges from the
 *   request's `mergedSha`. A request re-folds on every push, so the chain holds one merge per
 *   re-fold; only the newest is shown unless `showEarlierFolds`, and the rest are counted.
 * - Then one lane per source, `main` first and the others in source order. A commit belongs to the
 *   source whose tip reaches it in the fewest steps (walking parents, never through a fold merge);
 *   a tie goes to the higher priority, then to the earlier source. A commit no source reaches goes
 *   to a last lane, "other".
 * - The newest fold merges every source tip in the list, so its lines run into each source's lane.
 *   Shown earlier folds keep their real parents.
 */

/** A commit as the branch layout reads it. */
export interface BranchCommit {
  readonly hash: string;
  readonly parents: readonly string[];
  /** The service marks the request's own fold merges; absent: the first-parent chain decides. */
  readonly fold?: boolean;
}

/** A source branch of the request. */
export interface BranchSource {
  readonly name: string;
  /** The tip of the branch the newest fold merged. */
  readonly tipSha?: string;
  readonly priority?: string;
}

/** One lane: its label, and whose line it is. */
export interface BranchLane {
  readonly label: string;
  /** `guess`: a lane of commits by one author, while parents are not known. */
  readonly kind: 'backing' | 'source' | 'other' | 'guess';
}

/** The branch graph: the drawn graph, its lanes, the shown commits and the hidden folds. */
export interface BranchGraph extends CommitGraph {
  readonly lanes: readonly BranchLane[];
  /** The hashes of the shown commits, in row order. */
  readonly shown: readonly string[];
  /** How many earlier fold merges are hidden (0 when shown). */
  readonly hiddenFolds: number;
  /** How many earlier fold merges there are. */
  readonly earlierFolds: number;
}

const PRIORITY_RANK: Readonly<Record<string, number>> = {
  BLOCKING: 6,
  HIGHER: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  LOWEST: 1,
};

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

/** The lanes' sources, `main` first, then in the request's order. */
function orderedSources(sources: readonly BranchSource[]): readonly BranchSource[] {
  const main = sources.filter((source) => source.name === 'main');
  return [...main, ...sources.filter((source) => source.name !== 'main')];
}

/**
 * Lays out the fold of a request: `commits` newest first with their parents, `mergedSha` the
 * newest fold, `backingBranch` its branch, `sources` its source branches.
 */
export function branchGraph(input: {
  readonly commits: readonly BranchCommit[];
  readonly mergedSha: string;
  readonly backingBranch: string;
  readonly sources: readonly BranchSource[];
  readonly showEarlierFolds?: boolean;
}): BranchGraph {
  const { commits } = input;
  const listed = new Set(commits.map((commit) => commit.hash));
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const folds = foldChain(commits, input.mergedSha);
  const foldSet = new Set(folds);
  const sources = orderedSources(input.sources);

  // Which source reaches each commit first: breadth-first from each tip, never through a fold.
  const claims = new Map<string, { lane: number; steps: number; rank: number }>();
  sources.forEach((source, index) => {
    const lane = index + 1;
    const rank = PRIORITY_RANK[source.priority ?? ''] ?? 0;
    const start = source.tipSha;
    if (!start || !listed.has(start) || foldSet.has(start)) return;
    const seen = new Set([start]);
    let frontier = [start];
    for (let steps = 0; frontier.length > 0; steps++) {
      const next: string[] = [];
      for (const hash of frontier) {
        const held = claims.get(hash);
        const better =
          !held ||
          steps < held.steps ||
          (steps === held.steps && rank > held.rank) ||
          (steps === held.steps && rank === held.rank && lane < held.lane);
        if (better) claims.set(hash, { lane, steps, rank });
        for (const parent of byHash.get(hash)?.parents ?? []) {
          if (listed.has(parent) && !foldSet.has(parent) && !seen.has(parent)) {
            seen.add(parent);
            next.push(parent);
          }
        }
      }
      frontier = next;
    }
  });

  const otherLane = sources.length + 1;
  const unclaimed = commits.some((commit) => !foldSet.has(commit.hash) && !claims.has(commit.hash));
  const lanes: BranchLane[] = [
    { label: input.backingBranch, kind: 'backing' },
    ...sources.map((source): BranchLane => ({ label: source.name, kind: 'source' })),
    ...(unclaimed ? [{ label: 'other', kind: 'other' } as BranchLane] : []),
  ];
  const laneOf = (hash: string) => (foldSet.has(hash) ? 0 : (claims.get(hash)?.lane ?? otherLane));

  const showEarlier = input.showEarlierFolds === true;
  const shownCommits = commits.filter(
    (commit) => !foldSet.has(commit.hash) || commit.hash === folds[0] || showEarlier,
  );
  const tips = sources.flatMap((source) =>
    source.tipSha && listed.has(source.tipSha) && !foldSet.has(source.tipSha)
      ? [source.tipSha]
      : [],
  );
  const parentsOf = (commit: BranchCommit): readonly string[] =>
    commit.hash === folds[0] && !showEarlier ? tips : commit.parents;

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
 * The same lanes before the commits carry parents: the backing branch's lane with the fold's own
 * merge commits, a lane per source with nothing in it (no commit can be placed on a branch
 * without parents), then a lane per author with that author's other commits, each a straight
 * line (`inferLanes`). Every commit shows; nothing is folded away.
 */
export function guessedGraph(input: {
  readonly commits: readonly InferredCommit[];
  readonly backingBranch: string;
  readonly sources: readonly BranchSource[];
}): BranchGraph {
  const sources = orderedSources(input.sources);
  const inferred = inferLanes(input.commits, input.backingBranch);
  const parentOf = new Map(inferred.commits.map((commit) => [commit.hash, commit.parents ?? []]));
  // Each guessed lane opens at the commit its label is keyed by; walk it down to place it.
  const laneOfHash = new Map<string, number>();
  const lanes: BranchLane[] = [
    { label: input.backingBranch, kind: 'backing' },
    ...sources.map((source): BranchLane => ({ label: source.name, kind: 'source' })),
  ];
  for (const commit of input.commits) {
    const label = inferred.labels.get(commit.hash);
    if (label === undefined || laneOfHash.has(commit.hash)) continue;
    let lane = 0;
    if (label !== input.backingBranch) {
      lane = lanes.length;
      lanes.push({ label, kind: 'guess' });
    }
    for (let at: string | undefined = commit.hash; at; at = parentOf.get(at)?.[0]) {
      laneOfHash.set(at, lane);
    }
  }
  const graph = fixedLaneLayout(
    inferred.commits.map((commit) => ({
      hash: commit.hash,
      lane: laneOfHash.get(commit.hash) ?? 0,
      parents: commit.parents ?? [],
    })),
    lanes.length,
  );
  return {
    ...graph,
    lanes,
    shown: inferred.commits.map((commit) => commit.hash),
    earlierFolds: 0,
    hiddenFolds: 0,
  };
}
