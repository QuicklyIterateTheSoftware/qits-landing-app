import type { CiRun } from '$core/ci/ci-runs.consumes';
import type { ReleaseRequest } from './release-request.consumes';

/**
 * Keeping what the release request page shows to the request's current fold (`mergedSha`).
 *
 * qits-projects can answer a QA phase that still names the run of an earlier fold (a race when the
 * request re-folds, fixed but not yet released). `currentFoldPhases` replaces such a phase from
 * qits-ci's runs: the newest run of the request at the current fold, or a pending phase when it
 * has none yet.
 */

/** A qits-ci run status as a pipeline phase state. */
function phaseStateOf(status: string | undefined): string {
  switch (status) {
    case 'SUCCESS':
      return 'SUCCESS';
    case 'RUNNING':
    case 'QUEUED':
      return 'RUNNING';
    case 'FAILED':
    case 'CONFIG_ERROR':
    case 'TIMED_OUT':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * The request with its QA phase taken from the current fold: unchanged when the phase's run is at
 * `mergedSha` (or the runs are not known); else the newest run of this request at `mergedSha`
 * stands in, or the phase is pending when the fold has no run yet.
 */
export function currentFoldPhases(
  request: ReleaseRequest,
  runs: readonly CiRun[] | undefined,
): ReleaseRequest {
  const fold = request.mergedSha;
  const phases = request.pipeline?.phases;
  if (!fold || !phases || !runs) return request;
  const qa = phases.find((phase) => phase.phase === 'QA');
  const run = qa?.runId ? runs.find((entry) => entry.id === qa.runId) : undefined;
  if (!qa || !run || !run.commitSha || run.commitSha === fold) return request;
  const current = runs.find(
    (entry) =>
      entry.releaseRequestId === request.id &&
      entry.commitSha === fold &&
      entry.phase !== 'RELEASE',
  );
  const replaced = current
    ? { ...qa, runId: current.id, state: phaseStateOf(current.status), detail: undefined }
    : { ...qa, runId: undefined, state: 'PENDING', detail: undefined };
  return {
    ...request,
    pipeline: {
      ...request.pipeline,
      phases: phases.map((phase) => (phase === qa ? replaced : phase)),
    },
  };
}
