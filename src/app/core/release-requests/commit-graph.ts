/**
 * The commits a release request's fold brought in, laid out as a commit graph: one lane (column)
 * per line of history, a dot per commit in its lane, newest first, with lines from each commit
 * down to its parents. Pure; `ui-commit-graph` draws what this answers.
 *
 * Lanes come from the parent graph when the commits carry `parents`. qits-projects' commits
 * answer carries none today, so `inferLanes` stands in: the fold's own merge commits ("Release
 * request …") in one lane, every other commit in a lane per author, each lane a straight line.
 */

/** A commit as the layout needs it. */
export interface GraphCommit {
  readonly hash: string;
  /** Full shas, first parent first; undefined when the answer does not say. */
  readonly parents?: readonly string[];
}

/** A line in the lower half of a row: from the commit's lane to a parent's lane. */
export interface GraphEdge {
  readonly from: number;
  readonly to: number;
}

/** One row of the graph. */
export interface GraphRow {
  readonly hash: string;
  /** The lane of the commit's dot. */
  readonly lane: number;
  /** A line comes into the dot from above (a child in the list continues to it). */
  readonly incoming: boolean;
  /** Other lanes that end in this dot from above (a merge's second parent, say). */
  readonly converging: readonly number[];
  /** Lanes that pass by this row without touching the dot. */
  readonly passing: readonly number[];
  /** Lines from the dot down to its parents' lanes. */
  readonly edges: readonly GraphEdge[];
  /** The lanes alive below this row: what an opened row's extra space continues. */
  readonly below: readonly number[];
}

/** The graph: its rows, in the commits' order, and how many lanes wide it is. */
export interface CommitGraph {
  readonly rows: readonly GraphRow[];
  readonly width: number;
}

/**
 * Lays `commits` (newest first, each before its parents) out in lanes. A parent outside the list
 * ends its line at the row; a lane whose line ended is free for the next commit that needs one.
 */
export function layoutGraph(commits: readonly GraphCommit[]): CommitGraph {
  const known = new Set(commits.map((commit) => commit.hash));
  const active: (string | null)[] = [];
  const free = (avoid: number) => {
    const slot = active.findIndex((hash, index) => hash === null && index !== avoid);
    if (slot >= 0) return slot;
    active.push(null);
    return active.length - 1;
  };
  const rows: GraphRow[] = [];
  let width = 0;
  for (const commit of commits) {
    let lane = active.indexOf(commit.hash);
    const incoming = lane >= 0;
    if (!incoming) lane = free(-1);
    const converging: number[] = [];
    active.forEach((hash, index) => {
      if (index !== lane && hash === commit.hash) converging.push(index);
    });
    for (const index of converging) active[index] = null;
    const passing = active.flatMap((hash, index) =>
      hash !== null && index !== lane ? [index] : [],
    );
    const parents = (commit.parents ?? []).filter((parent) => known.has(parent));
    active[lane] = parents[0] ?? null;
    const edges: GraphEdge[] = parents.length > 0 ? [{ from: lane, to: lane }] : [];
    for (const parent of parents.slice(1)) {
      let target = active.indexOf(parent);
      if (target < 0) {
        target = free(lane);
        active[target] = parent;
      }
      edges.push({ from: lane, to: target });
    }
    const below = active.flatMap((hash, index) => (hash !== null ? [index] : []));
    width = Math.max(width, active.length, lane + 1);
    rows.push({ hash: commit.hash, lane, incoming, converging, passing, edges, below });
  }
  return { rows, width };
}

/** A commit as `inferLanes` reads it. */
export interface InferredCommit {
  readonly hash: string;
  readonly author?: string;
  readonly message?: string;
}

/** Lanes guessed without parents: each commit's stand-in parent, and each lane's label. */
export interface InferredLanes {
  readonly commits: readonly GraphCommit[];
  /** Each lane's label, by the hash of its newest commit. */
  readonly labels: ReadonlyMap<string, string>;
}

/** The fold's own merge commits: "Release request <id>: …". */
const FOLD_MESSAGE = /^Release request \S+:/;

/**
 * Lanes for commits that carry no parents: the fold's merge commits in the first lane (labelled
 * `foldLabel`), every other commit in a lane per author (labelled "by <author>"). Within a lane,
 * each commit's stand-in parent is the next older commit of the lane, so a lane is a straight line;
 * nothing is drawn between lanes, because nothing says where they meet.
 */
export function inferLanes(commits: readonly InferredCommit[], foldLabel: string): InferredLanes {
  const laneOf = (commit: InferredCommit) =>
    FOLD_MESSAGE.test(commit.message ?? '') ? '\u0000fold' : (commit.author ?? '');
  const next = new Map<string, string>();
  const labels = new Map<string, string>();
  const newest = new Map<string, string>();
  for (let index = commits.length - 1; index >= 0; index--) {
    const commit = commits[index];
    const lane = laneOf(commit);
    const older = newest.get(lane);
    if (older) next.set(commit.hash, older);
    newest.set(lane, commit.hash);
  }
  for (const lane of newest.keys()) {
    labels.set(newest.get(lane)!, lane === '\u0000fold' ? foldLabel : `by ${lane || 'unknown'}`);
  }
  return {
    commits: commits.map((commit) => ({
      hash: commit.hash,
      parents: next.has(commit.hash) ? [next.get(commit.hash)!] : [],
    })),
    labels,
  };
}

/**
 * Lane labels from the parent graph: the fold commit's first parent is the backing branch, and
 * each further parent the source of the same position (an octopus merge of the sources in order).
 * Answers the label for the hash of the commit that opens each lane.
 */
export function sourceLabels(
  fold: GraphCommit | undefined,
  backingBranch: string,
  sources: readonly string[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  if (fold) labels.set(fold.hash, backingBranch);
  (fold?.parents ?? []).slice(1).forEach((parent, index) => {
    const source = sources[index];
    if (source) labels.set(parent, source);
  });
  return labels;
}
