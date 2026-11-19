import type {
  GetBumpResponses,
  ListArtifactsResponses,
  ListDependencyDependentsResponses,
  ListDependenciesResponses,
  ListRepositoriesResponses,
  ListPendingBumpsResponses,
} from '../../api/maintenance';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-maintenance's answer (epic qits-112). The operation over it
 * (`PENDING_BUMPS_LIST`, `maintenance.operations.ts`) narrows the answer to this list, so nothing
 * can read any other field, and its pact spec passes the same list as `consumes`. To read another
 * field, add it here.
 */

/** How many pending bumps the bumps menu asks for: the newest, one page. */
export const PENDING_BUMPS = 20;

/**
 * `PENDING_BUMPS_LIST`: the newest bumps still on their way, of every repository, for the top
 * bar's bumps menu. Each row shows the repository, what moves (each change's dependency, ecosystem
 * and versions), the bump's mode, and how it stands: its run, or once green, its release.
 */
export const LIST_PENDING_BUMPS = [
  'bumps[].id',
  'bumps[].repository',
  'bumps[].mode',
  'bumps[].status',
  'bumps[].releaseState',
  'bumps[].changes[].ecosystem',
  'bumps[].changes[].name',
  'bumps[].changes[].from',
  'bumps[].changes[].to',
] as const;

/** One pending bump, cut to what the menu reads. */
export type BumpEntry = NonNullable<
  Consumed<ListPendingBumpsResponses[200], typeof LIST_PENDING_BUMPS>['bumps']
>[number];

/**
 * `MAINTENANCE_REPOSITORIES` (qits-2317): every repository of the inventory, read by the
 * Maintenance section's Dependencies page for its project only: the doors take no project, so the
 * page keeps the pins of the repositories whose `project` is the open one's id.
 */
export const LIST_REPOSITORIES = ['[].name', '[].project'] as const;

/**
 * `MAINTENANCE_DEPENDENCIES` (qits-2317): the dependencies of one kind (`?kind=INTERNAL` or
 * `?kind=EXTERNAL`, never the bare listing, which mixes in a repository's own modules), each with
 * its latest version (null when unknown, with the `error` that says why) and every pin of it: the
 * repository, the version it pins, where (`manifestPath`), and whether that pin is behind
 * (`pending`).
 */
export const LIST_DEPENDENCIES = [
  '[].ecosystem',
  '[].name',
  '[].latest',
  '[].error',
  '[].pins[].repository',
  '[].pins[].version',
  '[].pins[].manifestPath',
  '[].pins[].pending',
] as const;

/** One repository of the inventory, cut to what the Dependencies page reads. */
export type MaintenanceRepository = Consumed<
  ListRepositoriesResponses[200],
  typeof LIST_REPOSITORIES
>[number];

/** One dependency with its pins, cut to what the Dependencies page reads. */
export type DependencyEntry = Consumed<
  ListDependenciesResponses[200],
  typeof LIST_DEPENDENCIES
>[number];

/**
 * `MAINTENANCE_ARTIFACTS` (qits-2330): every artifact the platform has released, one row each, read
 * by the Maintenance section's Artifacts page for its project only (the artifacts whose
 * `repository` is one of the open project's): its ecosystem and name, the repository producing it,
 * its latest version (null when unknown), its newest release (`version`, built at `occurredAt`)
 * and whether that release's SBOM was read (`sbomStatus`: INGESTED, MISSING, FAILED), and how many
 * newest releases of ours embed it (`dependentCount`), of which an older copy (`behindCount`).
 */
export const LIST_ARTIFACTS = [
  '[].ecosystem',
  '[].name',
  '[].repository',
  '[].latest',
  '[].version',
  '[].occurredAt',
  '[].sbomStatus',
  '[].dependentCount',
  '[].behindCount',
] as const;

/**
 * `MAINTENANCE_DEPENDENTS` (qits-2330): for one artifact (`?ecosystem=&name=`), its latest version
 * and every released artifact of ours whose newest release embeds it, read off the SBOMs: that
 * artifact (`artifactEcosystem`, `artifactName`, `artifactVersion`), its repository, the version it
 * embeds, whether directly, when it was built and its own SBOM's status.
 */
export const LIST_DEPENDENCY_DEPENDENTS = [
  'ecosystem',
  'name',
  'latest',
  'dependents[].artifactEcosystem',
  'dependents[].artifactName',
  'dependents[].artifactVersion',
  'dependents[].repository',
  'dependents[].embeddedVersion',
  'dependents[].direct',
  'dependents[].occurredAt',
  'dependents[].sbomStatus',
] as const;

/**
 * `MAINTENANCE_DEPENDENTS`'s refusal: a 400 (an ecosystem the door does not read, such as
 * `daemon`, or no name) carries the service's reason as `message`, which the detail shows.
 */
export const DEPENDENTS_REFUSAL = ['message'] as const;

/** One released artifact, cut to what the Artifacts page reads. */
export type ArtifactEntry = Consumed<ListArtifactsResponses[200], typeof LIST_ARTIFACTS>[number];

/** One artifact's dependents, cut to what the Artifacts page's detail reads. */
export type ArtifactDependents = Consumed<
  ListDependencyDependentsResponses[200],
  typeof LIST_DEPENDENCY_DEPENDENTS
>;

/**
 * `MAINTENANCE_BUMP` (qits-2332): one bump, as the bump page shows it. Its group (the automation
 * kind) and repository, its status, mode, trigger and branch; when it started and finished; the
 * commit it produced (`resultSha`) and the pipeline it ran (`configPath`); the release request it
 * belongs to (a uuid, or the sentinels `converged` and `refused`) and how that release stands
 * (`releaseState`, `releaseDetail`, as of `releaseStateAt`); its CI runs (`ciRunIds`, else the
 * comma-joined `ciRunId`) and their status; its `message`; a failed run's `failure` (the failing
 * step, its image and exit code, the log excerpt); and every change it sent.
 */
export const BUMP = [
  'id',
  'repository',
  'group',
  'mode',
  'trigger',
  'branch',
  'status',
  'startedAt',
  'finishedAt',
  'resultSha',
  'configPath',
  'releaseRequestId',
  'releaseState',
  'releaseDetail',
  'releaseStateAt',
  'ciRunId',
  'ciRunIds',
  'ciRunStatus',
  'message',
  'failure.stepIndex',
  'failure.image',
  'failure.exitCode',
  'failure.excerpt',
  'changes[].ecosystem',
  'changes[].manifestPath',
  'changes[].name',
  'changes[].from',
  'changes[].to',
  'changes[].location',
] as const;

/** One bump, cut to what the bump page reads. */
export type BumpDetail = Consumed<GetBumpResponses[200], typeof BUMP>;

/** One change a bump sent, as the bump page's table reads it. */
export type BumpChange = NonNullable<BumpDetail['changes']>[number];
