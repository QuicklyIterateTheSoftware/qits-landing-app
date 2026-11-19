import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import type { CiRun } from './ci-runs.consumes';
import type { CiRunStatusName } from './project-ci';

/**
 * A repository's CI page (qits-2320, `projects/<slug>/ci/<repository>`): the repository found by
 * its name, its runs filtered by the query, and what each row says of a run. Pure functions, so
 * the page only draws what they give.
 */

/** How a run was triggered, as `?trigger=` names it: `push` for `POST_RECEIVE`, `event` for `EVENT`. */
export const RUN_TRIGGERS = ['push', 'event'] as const;

/** A run's trigger, as `?trigger=` names it. */
export type RunTriggerName = (typeof RUN_TRIGGERS)[number];

/** Whether `value` names a run trigger (`push` or `event`, exactly). */
export function isRunTrigger(value: string | null | undefined): value is RunTriggerName {
  return RUN_TRIGGERS.includes(value as RunTriggerName);
}

/** A run's `triggerType` as the page names it; none for a type it does not know. */
export function runTrigger(triggerType: string | null | undefined): RunTriggerName | undefined {
  switch (triggerType) {
    case 'POST_RECEIVE':
      return 'push';
    case 'EVENT':
      return 'event';
    default:
      return undefined;
  }
}

/** The repository of `entries` (the project's, as qits-projects lists them) named `name`. */
export function repositoryNamed(
  entries: readonly RepositoryEntry[],
  name: string,
): NonNullable<RepositoryEntry['repository']> | undefined {
  return (
    entries.find((entry) => !!name && entry.repository?.name === name)?.repository ?? undefined
  );
}

/** The page's filters, as the query names them. */
export interface RepositoryRunFilters {
  /** `?status=`: the run's status; none for any. */
  readonly status: CiRunStatusName | undefined;
  /** `?branch=`: a part of the run's branch, any case; empty for every branch. */
  readonly branch: string;
  /** `?trigger=`: how the run was triggered; none for any. */
  readonly trigger: RunTriggerName | undefined;
}

/**
 * The runs `filters` keep, in qits-ci's order (newest first): a run in `filters.status`, on a
 * branch holding `filters.branch` (case-insensitive), triggered as `filters.trigger`.
 */
export function filterRepositoryRuns(
  runs: readonly CiRun[],
  filters: RepositoryRunFilters,
): readonly CiRun[] {
  const text = filters.branch.trim().toLowerCase();
  return runs.filter(
    (run) =>
      (!filters.status || run.status === filters.status) &&
      (!text || (run.branch ?? '').toLowerCase().includes(text)) &&
      (!filters.trigger || runTrigger(run.triggerType) === filters.trigger),
  );
}

/** A run's id for a row: its first eight characters, as qits-ci shortens it. */
export function shortRunId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : '–';
}

/** Milliseconds since the epoch of `iso`; none for a missing or unreadable one. */
function at(iso: string | null | undefined): number | undefined {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/** A duration for a row: `0s`, `45s`, `2m 5s`, `1h 3m`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * How long a run took: `finishedAt − (startedAt ?? createdAt)` (a run cancelled before it started
 * counts from when it was queued), "running" while it has not finished, "–" when an instant is
 * unreadable.
 */
export function runDuration(run: Pick<CiRun, 'createdAt' | 'startedAt' | 'finishedAt'>): string {
  if (!run.finishedAt) return 'running';
  const finished = at(run.finishedAt);
  const started = at(run.startedAt) ?? at(run.createdAt);
  return finished === undefined || started === undefined ? '–' : formatDuration(finished - started);
}

/** An `EVENT` run's provenance, `triggerEventName · configPath`; none for any other run. */
export function runProvenance(
  run: Pick<CiRun, 'triggerType' | 'triggerEventName' | 'configPath'>,
): string | undefined {
  if (run.triggerType !== 'EVENT') return undefined;
  const parts = [run.triggerEventName, run.configPath].filter((part) => !!part);
  return parts.length ? parts.join(' · ') : undefined;
}
