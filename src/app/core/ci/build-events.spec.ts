import { buildOfRepository, buildOfRun, BUILD_EVENTS } from './build-events';

const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });

/**
 * The CI reads' staleness (qits-1270): a repository's runs are read again after a build event
 * naming that repository (`buildOfRepository`, the release request page's and the lightning menu's
 * `refreshOn`), a run's reports after one naming that run (`buildOfRun`, `app-run-reports`');
 * nothing else does.
 */
describe('build events', () => {
  it('names qits-ci’s three run events', () => {
    expect(BUILD_EVENTS).toEqual(['BuildStatusChanged', 'BuildSuccessful', 'BuildFailed']);
  });

  it('is about a repository when its repoId is one of them', () => {
    const built = event('BuildStatusChanged', { repoId: 'r1', runId: 'run-1' });
    expect(buildOfRepository(built, ['r1'])).toBe(true);
    expect(buildOfRepository(built, ['r2', undefined])).toBe(false);
    expect(buildOfRepository(event('BuildFailed', { runId: 'run-1' }), [undefined])).toBe(false);
  });

  it('is about a run when its runId is that run', () => {
    const built = event('BuildSuccessful', { repoId: 'r1', runId: 'run-1' });
    expect(buildOfRun(built, 'run-1')).toBe(true);
    expect(buildOfRun(built, 'run-2')).toBe(false);
    expect(buildOfRun(event('BuildSuccessful', { repoId: 'r1' }), undefined)).toBe(false);
  });
});
