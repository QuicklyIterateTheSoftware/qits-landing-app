import type { ChipTone } from '$ui/components/chip/chip';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import type { ActiveCiRun, CiRepositorySummary, CiSummaryRun } from './ci-runs.consumes';

/**
 * The project's CI page (qits-2314, `projects/<slug>/ci`): the project's repositories joined to
 * qits-ci's repository summaries, ordered and filtered. Pure functions, so the page only draws
 * what they give.
 */

/** Every status a qits-ci run can be in, in its lifecycle's order: what `?status=` accepts. */
export const CI_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'CONFIG_ERROR',
  'TIMED_OUT',
] as const;

/** A run's status, as `?status=` names it. */
export type CiRunStatusName = (typeof CI_RUN_STATUSES)[number];

/** Whether `value` names a run status (exactly, as qits-ci spells it). */
export function isRunStatus(value: string | null | undefined): value is CiRunStatusName {
  return CI_RUN_STATUSES.includes(value as CiRunStatusName);
}

const TONES: Readonly<Record<string, ChipTone>> = {
  SUCCESS: 'ok',
  QUEUED: 'waiting',
  RUNNING: 'waiting',
  FAILED: 'failed',
  CONFIG_ERROR: 'failed',
  TIMED_OUT: 'failed',
};

/** A run status's chip tone: green done, amber in flight, red failed, grey cancelled or unknown. */
export function runStatusTone(status: string | null | undefined): ChipTone {
  return TONES[status ?? ''] ?? 'neutral';
}

/** A run status for a person: `CONFIG_ERROR` is "config error". */
export function runStatusLabel(status: string | null | undefined): string {
  return (status ?? '').toLowerCase().replaceAll('_', ' ');
}

/** One row of the page: a repository of the project, with its newest runs when qits-ci has any. */
export interface CiRepositoryRow {
  /** The repository's id, which the summaries are joined on. */
  readonly id: string;
  readonly name: string;
  /** Its component, else its archetype's category (`ciRepositoryGroup`); none for the wrapper. */
  readonly group: string | undefined;
  /** Its newest run, on any branch. */
  readonly lastRun: CiSummaryRun | undefined;
  /** Its newest run on its main branch. */
  readonly lastMainRun: CiSummaryRun | undefined;
}

/**
 * The archetype qits-projects records, mapped to the category qits-ci's chrome groups a
 * repository without a component by (`@qits/ui-components`' `repositories.ts`, `CATEGORY_OF`): the
 * middle segment of qits-ci's `/<project>/<group>/<repository>` address.
 */
const CATEGORY_OF: Readonly<Record<string, string>> = {
  SERVICE: 'services',
  DAEMON: 'daemons',
  LIBRARY: 'libs',
  APP: 'apps',
  FRONTEND: 'frontends',
  CLI: 'cli',
  IMAGE: 'images',
};

/**
 * A repository's group in qits-ci's addresses: its component where qits-projects records one,
 * else its archetype's category, as qits-ci's chrome groups it. None for a repository with
 * neither (the wrapper, whose archetype is `PROJECT`).
 */
export function ciRepositoryGroup(repository: {
  readonly component?: string | null;
  readonly archetype?: string | null;
}): string | undefined {
  return repository.component || CATEGORY_OF[repository.archetype ?? ''] || undefined;
}

/** Milliseconds since the epoch of `iso`; `-Infinity` for none, so it sorts last. */
function at(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * One row per repository of the project (`entries`, as qits-projects lists them), each with the
 * summary qits-ci answers for its id. Joined on the repository's id, never on the summary's
 * `projectId`: qits-ci knows a run's project only when its push came in on the public address. A
 * summary of a repository the project does not hold is left out.
 *
 * Ordered by the newest run's `createdAt`, newest first; a repository without a run comes last.
 * Equal instants keep qits-projects' order.
 */
export function ciRows(
  entries: readonly RepositoryEntry[],
  summaries: readonly CiRepositorySummary[],
): readonly CiRepositoryRow[] {
  const byId = new Map<string, CiRepositorySummary>();
  for (const summary of summaries) {
    if (summary.repositoryId) byId.set(summary.repositoryId, summary);
  }
  const rows: CiRepositoryRow[] = [];
  for (const entry of entries) {
    const repository = entry.repository;
    if (!repository?.id) continue;
    const summary = byId.get(repository.id);
    rows.push({
      id: repository.id,
      name: repository.name ?? repository.id,
      group: ciRepositoryGroup(repository),
      lastRun: summary?.lastRun ?? undefined,
      lastMainRun: summary?.lastMainRun ?? undefined,
    });
  }
  return rows
    .map((row, index) => ({ row, index, created: at(row.lastRun?.createdAt) }))
    .sort((a, b) => b.created - a.created || a.index - b.index)
    .map(({ row }) => row);
}

/** The page's filters, as the query names them. */
export interface CiFilters {
  /** `?repository=`: a part of the repository's name, any case; empty for every repository. */
  readonly repository: string;
  /** `?status=`: the newest run's status; none for any. */
  readonly status: CiRunStatusName | undefined;
}

/**
 * The rows `filters` keep: a repository whose name holds `filters.repository` (case-insensitive),
 * and whose newest run is in `filters.status` (a repository without a run has no status, so a
 * status filter drops it).
 */
export function filterCiRows(
  rows: readonly CiRepositoryRow[],
  filters: CiFilters,
): readonly CiRepositoryRow[] {
  const text = filters.repository.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!text || row.name.toLowerCase().includes(text)) &&
      (!filters.status || row.lastRun?.status === filters.status),
  );
}

/** The active runs of the project's repositories (`repoIds`), in qits-ci's order. */
export function projectActiveRuns(
  runs: readonly ActiveCiRun[],
  repoIds: ReadonlySet<string>,
): readonly ActiveCiRun[] {
  return runs.filter((run) => !!run.repoId && repoIds.has(run.repoId));
}

/**
 * A repository's page in qits-ci (until qits-2320 gives it one here): `/<slug>/<group>/<name>`,
 * or, for a repository without a group (the wrapper), qits-ci's tree with it expanded
 * (`/?repo=<id>`, as the release request page links a repository's runs). Undefined without
 * qits-ci's origin.
 */
export function ciRepositoryHref(
  origin: string,
  slug: string,
  row: Pick<CiRepositoryRow, 'id' | 'name' | 'group'>,
): string | undefined {
  if (!origin) return undefined;
  if (!row.group || !slug) return `${origin}/?repo=${encodeURIComponent(row.id)}`;
  return `${origin}/${[slug, row.group, row.name].map(encodeURIComponent).join('/')}`;
}

/** A run's page in qits-ci (until qits-2321 gives it one here): `/runs/<id>`. */
export function ciRunHref(origin: string, runId: string | undefined): string | undefined {
  return origin && runId ? `${origin}/runs/${encodeURIComponent(runId)}` : undefined;
}
