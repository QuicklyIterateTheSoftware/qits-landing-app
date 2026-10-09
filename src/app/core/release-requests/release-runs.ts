import type { CiRun } from '$core/ci/ci-runs.consumes';
import type { CommitBuild, ReleaseRequest } from './release-request.consumes';

/** One CI run of a release request, as its page lists it. */
export interface RequestRun {
  readonly id: string;
  /** What the run was for: "QA of the fold", "Release of the tag", "Automation: Bump"… */
  readonly label: string;
  /** From qits-ci's list; absent for a run only the request names (older, or in another repo). */
  readonly run?: CiRun;
}

/** What a run of a release request is, by its phase. */
function phaseLabel(run: CiRun): string {
  switch (run.phase) {
    case 'RELEASE_REQUEST':
      return 'Test run of the fold';
    case 'RELEASE':
      return 'Release of the tag';
    default:
      return 'CI run';
  }
}

/**
 * The CI runs of a release request, newest first: every run of the repository's newest runs
 * (`runs`) that names the request (`releaseRequestId`), and every run the request itself names —
 * its CI verdicts (`builds`), the QA and Publish phases of its pipeline, and its automations. The
 * Deployment phase's run id names a deployment request, not a CI run, so it is left out. A run
 * named twice is listed once, with the first label: qits-ci's phase, then the request's own name.
 */
export function requestRuns(
  request: ReleaseRequest,
  builds: readonly CommitBuild[],
  runs: readonly CiRun[],
): readonly RequestRun[] {
  const byId = new Map(runs.flatMap((run) => (run.id ? [[run.id, run] as const] : [])));
  const found = new Map<string, RequestRun>();
  const add = (id: string | undefined, label: string) => {
    if (!id || found.has(id)) return;
    found.set(id, { id, label, run: byId.get(id) });
  };
  for (const run of runs) {
    if (request.id && run.releaseRequestId === request.id) add(run.id, phaseLabel(run));
  }
  for (const phase of request.pipeline?.phases ?? []) {
    if (phase.phase === 'QA') add(phase.runId, 'Test run of the fold');
    if (phase.phase === 'PUBLISH') add(phase.runId, 'Release of the tag');
  }
  for (const build of builds) add(build.runId, `CI verdict on ${build.branch ?? 'the fold'}`);
  for (const automation of request.automations ?? []) {
    add(automation.runId, `Automation: ${automation.label ?? automation.kind ?? ''}`);
  }
  const at = (entry: RequestRun) => Date.parse(entry.run?.createdAt ?? '') || 0;
  return [...found.values()].sort((left, right) => at(right) - at(left));
}
