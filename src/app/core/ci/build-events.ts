import { payloadIds, type WithPayload } from '$core/events/refresh-on';

/**
 * qits-ci's events about one run: it changed status (`BuildStatusChanged`: queued, started,
 * finished…), it succeeded (`BuildSuccessful`), it failed (`BuildFailed`). Each names the run
 * (`runId`), its repository (`repoId`), its project (`projectId`) and, for a release request's
 * build, the request (`releaseRequestId`). A run's reports have no event of their own: a CI step
 * submits them while it runs, and the run's finish is the last of them.
 */
export const BUILD_EVENTS = ['BuildStatusChanged', 'BuildSuccessful', 'BuildFailed'] as const;

/** Whether a build event is about a run of one of `repoIds` (its `repoId`). */
export function buildOfRepository(
  event: WithPayload,
  repoIds: readonly (string | undefined)[],
): boolean {
  const repositoryId = payloadIds(event).repositoryId;
  return !!repositoryId && repoIds.includes(repositoryId);
}

/** Whether a build event is about the run `runId` (its `runId`). */
export function buildOfRun(event: WithPayload, runId: string | undefined): boolean {
  const named = payloadIds(event).runId;
  return !!named && named === runId;
}
