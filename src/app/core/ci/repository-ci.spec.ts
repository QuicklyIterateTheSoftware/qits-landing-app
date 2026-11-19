import { ciGoldenMaster, goldenMaster } from '../../../testing/golden-masters';
import type { RepositoryEntry } from '$core/repositories/repositories.consumes';
import type { CiRun } from './ci-runs.consumes';
import {
  filterRepositoryRuns,
  formatDuration,
  isRunTrigger,
  repositoryNamed,
  runDuration,
  runProvenance,
  runTrigger,
  shortRunId,
} from './repository-ci';

/**
 * A repository's CI page's helpers (qits-2320), over qits-projects' "a project with 3
 * repositories" and qits-ci's "a repository of the project with a run history" (contract-service's
 * runs, newest first: RUNNING, SUCCESS and SUCCESS (a push) on main, FAILED on main, CANCELLED
 * (deduped by the FAILED one), FAILED on `feature/csv-export`).
 */
const HISTORY = 'a repository of the project with a run history';
const entries = (): readonly RepositoryEntry[] =>
  goldenMaster('a project with 3 repositories', 'listProjectRepositories').entries;
const runs = (): readonly CiRun[] => ciGoldenMaster(HISTORY, 'listRuns').runs;
const ids = (list: readonly CiRun[]) => list.map((run) => run.id?.slice(-2));
const ANY = { status: undefined, branch: '', trigger: undefined } as const;

describe('repositoryNamed', () => {
  it('finds the project’s repository by its exact name', () => {
    expect(repositoryNamed(entries(), 'contract-service')?.id).toBe(
      '00000000-0000-4000-8000-000000000005',
    );
    expect(repositoryNamed(entries(), 'Contract-Service')).toBeUndefined();
    expect(repositoryNamed(entries(), 'contract')).toBeUndefined();
    expect(repositoryNamed(entries(), '')).toBeUndefined();
  });
});

describe('filterRepositoryRuns', () => {
  it('keeps every run, in qits-ci’s order, without a filter', () => {
    expect(ids(filterRepositoryRuns(runs(), ANY))).toEqual(['06', '04', '07', '03', '02', '01']);
  });

  it('keeps the runs in ?status=', () => {
    expect(ids(filterRepositoryRuns(runs(), { ...ANY, status: 'FAILED' }))).toEqual(['03', '01']);
  });

  it('keeps the runs whose branch holds ?branch=, any case', () => {
    expect(ids(filterRepositoryRuns(runs(), { ...ANY, branch: ' CSV ' }))).toEqual(['01']);
    expect(ids(filterRepositoryRuns(runs(), { ...ANY, branch: 'nothing-like-it' }))).toEqual([]);
  });

  it('keeps the push or the event runs by ?trigger=', () => {
    expect(ids(filterRepositoryRuns(runs(), { ...ANY, trigger: 'push' }))).toEqual(['07']);
    expect(ids(filterRepositoryRuns(runs(), { ...ANY, trigger: 'event' }))).toEqual([
      '06',
      '04',
      '03',
      '02',
      '01',
    ]);
  });

  it('applies every filter together', () => {
    expect(
      ids(filterRepositoryRuns(runs(), { status: 'FAILED', branch: 'main', trigger: 'event' })),
    ).toEqual(['03']);
  });
});

describe('the repository CI page’s run helpers', () => {
  it('names a trigger as ?trigger= does', () => {
    expect(runTrigger('POST_RECEIVE')).toBe('push');
    expect(runTrigger('EVENT')).toBe('event');
    expect(runTrigger(undefined)).toBeUndefined();
    expect(isRunTrigger('push')).toBe(true);
    expect(isRunTrigger('PUSH')).toBe(false);
    expect(isRunTrigger(null)).toBe(false);
  });

  it('measures a run from its start, else from when it was queued, and says “running” until it ends', () => {
    expect(
      runDuration({
        createdAt: '2026-01-01T00:00:00Z',
        startedAt: '2026-01-01T00:00:30Z',
        finishedAt: '2026-01-01T00:02:35Z',
      }),
    ).toBe('2m 5s');
    expect(
      runDuration({
        createdAt: '2026-01-01T00:00:00Z',
        startedAt: undefined,
        finishedAt: '2026-01-01T00:00:12Z',
      }),
    ).toBe('12s');
    expect(
      runDuration({
        createdAt: '2026-01-01T00:00:00Z',
        startedAt: undefined,
        finishedAt: undefined,
      }),
    ).toBe('running');
    expect(runDuration({ createdAt: 'never', startedAt: undefined, finishedAt: 'never' })).toBe(
      '–',
    );
    expect(formatDuration(3_780_000)).toBe('1h 3m');
  });

  it('says an event run’s event and config file, and nothing for a push', () => {
    const [running, , push] = runs();
    expect(runProvenance(running)).toBe('SoftwareRelease · .config/qits/ci-event-build.yml');
    expect(runProvenance(push)).toBeUndefined();
  });

  it('shortens a run id to its first eight characters', () => {
    expect(shortRunId('0123abcd-0000-4000-8000-000000000001')).toBe('0123abcd');
    expect(shortRunId(undefined)).toBe('–');
  });
});
