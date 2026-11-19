import { ciGoldenMaster, goldenMaster } from '../../../testing/golden-masters';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import type { ActiveCiRun, CiRepositorySummary } from './ci-runs.consumes';
import {
  ciRows,
  filterCiRows,
  isRunStatus,
  projectActiveRuns,
  runStatusLabel,
  runStatusTone,
} from './project-ci';

/**
 * The CI page's join, order and filters (qits-2314), over qits-projects' "a project with 3
 * repositories" (the wrapper, contract-daemon, contract-frontend, contract-service) and qits-ci's
 * "a project whose repositories have runs", whose summaries name the same repository ids.
 */
const RUNS = 'a project whose repositories have runs';
const entries = (): readonly RepositoryEntry[] =>
  goldenMaster('a project with 3 repositories', 'listProjectRepositories').entries;
const summaries = (): readonly CiRepositorySummary[] =>
  ciGoldenMaster(RUNS, 'listRepositorySummaries').repositories;

/** A summary like `summary`, its newest run queued at `createdAt` (none for no run). */
function at(summary: CiRepositorySummary, createdAt: string | undefined): CiRepositorySummary {
  return {
    ...summary,
    lastRun: createdAt ? { ...summary.lastRun, createdAt } : undefined,
  };
}

describe('ciRows', () => {
  it('gives one row per repository of the project, joined by repository id', () => {
    const rows = ciRows(entries(), summaries());
    expect(rows.map((row) => [row.name, row.lastRun?.status, row.lastMainRun?.status])).toEqual([
      ['contract-00000001-contract-00000001', 'FAILED', 'FAILED'],
      ['contract-daemon', 'SUCCESS', 'SUCCESS'],
      ['contract-frontend', 'FAILED', 'SUCCESS'],
      ['contract-service', 'RUNNING', 'RUNNING'],
    ]);
    expect(rows[2].lastRun?.branch).toBe('feature/csv-export');
  });

  it('joins on the repository id, never on the summary’s project, and drops other repositories', () => {
    const recorded = summaries();
    const foreign = { ...recorded[0], repositoryId: 'another-repository' };
    const unclaimed = { ...recorded[1], projectId: undefined };
    const rows = ciRows(entries(), [foreign, unclaimed]);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.lastRun).map((row) => row.name)).toEqual(['contract-daemon']);
  });

  it('orders by the newest run, newest first, and lists repositories without a run last', () => {
    const [wrapper, daemon, frontend, service] = summaries();
    const rows = ciRows(entries(), [
      at(wrapper, '2026-01-01T00:01:00Z'),
      at(daemon, undefined),
      at(frontend, '2026-01-01T00:03:00Z'),
      at(service, '2026-01-01T00:02:00Z'),
    ]);
    expect(rows.map((row) => row.name)).toEqual([
      'contract-frontend',
      'contract-service',
      'contract-00000001-contract-00000001',
      'contract-daemon',
    ]);
    expect(rows[3].lastRun).toBeUndefined();
  });

  it('keeps qits-projects’ order between runs queued at the same instant', () => {
    expect(ciRows(entries(), summaries()).map((row) => row.name)).toEqual(
      entries().map((entry) => entry.repository?.name),
    );
  });

  it('lists every repository without a run when qits-ci has none ("no runs recorded")', () => {
    const none = ciGoldenMaster('no runs recorded', 'listRepositorySummaries').repositories;
    const rows = ciRows(entries(), none);
    expect(rows).toHaveLength(4);
    expect(rows.some((row) => row.lastRun)).toBe(false);
  });
});

describe('filterCiRows', () => {
  const rows = () => ciRows(entries(), summaries());

  it('keeps every row without a filter', () => {
    expect(filterCiRows(rows(), { repository: '', status: undefined })).toHaveLength(4);
  });

  it('keeps the repositories whose name holds the text, in any case', () => {
    expect(
      filterCiRows(rows(), { repository: ' FrontEnd ', status: undefined }).map((r) => r.name),
    ).toEqual(['contract-frontend']);
    expect(
      filterCiRows(rows(), { repository: 'contract-', status: undefined }).map((r) => r.name),
    ).toHaveLength(4);
  });

  it('keeps the repositories whose newest run is in the status, not their newest main run', () => {
    expect(
      filterCiRows(rows(), { repository: '', status: 'FAILED' }).map((row) => row.name),
    ).toEqual(['contract-00000001-contract-00000001', 'contract-frontend']);
    expect(
      filterCiRows(rows(), { repository: '', status: 'SUCCESS' }).map((row) => row.name),
    ).toEqual(['contract-daemon']);
  });

  it('applies both filters, and a status filter drops a repository without a run', () => {
    expect(filterCiRows(rows(), { repository: 'daemon', status: 'FAILED' })).toEqual([]);
    const none = ciRows(entries(), []);
    expect(filterCiRows(none, { repository: '', status: 'QUEUED' })).toEqual([]);
  });
});

describe('the CI page’s helpers', () => {
  it('accepts exactly qits-ci’s run statuses', () => {
    expect(isRunStatus('CONFIG_ERROR')).toBe(true);
    expect(isRunStatus('failed')).toBe(false);
    expect(isRunStatus(null)).toBe(false);
  });

  it('labels and tones a status', () => {
    expect(runStatusLabel('TIMED_OUT')).toBe('timed out');
    expect(runStatusTone('SUCCESS')).toBe('ok');
    expect(runStatusTone('QUEUED')).toBe('waiting');
    expect(runStatusTone('CONFIG_ERROR')).toBe('failed');
    expect(runStatusTone('CANCELLED')).toBe('neutral');
  });

  it('keeps the active runs of the project’s repositories only', () => {
    const runs: readonly ActiveCiRun[] = ciGoldenMaster(RUNS, 'listActiveRuns').runs;
    const ids = new Set(entries().map((entry) => entry.repository!.id!));
    expect(projectActiveRuns(runs, ids).map((run) => run.repoId)).toEqual([
      '00000000-0000-4000-8000-000000000005',
    ]);
    expect(projectActiveRuns(runs, new Set(['another-repository']))).toEqual([]);
  });
});
