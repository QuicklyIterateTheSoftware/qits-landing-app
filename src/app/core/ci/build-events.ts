/**
 * qits-ci's events about one run: it changed status (`BuildStatusChanged`: queued, started,
 * finished…), it succeeded (`BuildSuccessful`), it failed (`BuildFailed`). Each names the run
 * (`runId`), its repository (`repoId`), its project (`projectId`) and, for a release request's
 * build, the request (`releaseRequestId`). A run's reports have no event of their own: a CI step
 * submits them while it runs, and the run's finish is the last of them.
 */
export const BUILD_EVENTS = ['BuildStatusChanged', 'BuildSuccessful', 'BuildFailed'] as const;
