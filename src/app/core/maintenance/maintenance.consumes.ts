import type {
  GetAdoptionByReleaseResponses,
  GetBumpResponses,
  GetRepositoryDownstreamResponses,
  GetRepositoryResponses,
  ListArtifactsResponses,
  ListArtifactVersionsResponses,
  ListBumpsResponses,
  ListDependencyDependentsResponses,
  ListDependenciesResponses,
  ListPendingBumpsResponses,
  ListRepositoryDependentsResponses,
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

/**
 * `MAINTENANCE_REPOSITORY` (qits-2334): one repository of the inventory by its name, as the
 * Depends on page shows it (qits-2489). Its name, its status (`OK`, `ABSENT`, `UNDECLARED` or any other word),
 * when it was last scanned and the scan's `message`; every pin (where, `manifestPath`; what,
 * `ecosystem` and `name`; the version it pins, the latest one, its `kind`: INTERNAL, EXTERNAL,
 * REACTOR or UNRESOLVED, and whether it is behind, the service's `pending`); and the transitives
 * the pins bring in (what, which version, through which pin, `via`, and whether it is `behind`).
 * Not the groups: the page shows none (qits-1133 retired them).
 */
export const REPOSITORY = [
  'name',
  'status',
  'lastScanAt',
  'message',
  'pins[].manifestPath',
  'pins[].ecosystem',
  'pins[].name',
  'pins[].version',
  'pins[].latest',
  'pins[].kind',
  'pins[].pending',
  'transitives[].ecosystem',
  'transitives[].name',
  'transitives[].version',
  'transitives[].via',
  'transitives[].behind',
] as const;

/** One repository, cut to what the Depends on page reads. */
export type RepositoryDetail = Consumed<GetRepositoryResponses[200], typeof REPOSITORY>;

/** One pin of a repository, as the Depends on page's tables read it. */
export type RepositoryPin = NonNullable<RepositoryDetail['pins']>[number];

/** One transitive of a repository, as the Depends on page reads it. */
export type RepositoryTransitive = NonNullable<RepositoryDetail['transitives']>[number];

/** How many bumps the Depends on page asks for: the newest, one page. */
export const REPOSITORY_BUMPS_LIMIT = 20;

/**
 * `MAINTENANCE_REPOSITORY_BUMPS` (qits-2334): the newest bumps of one repository
 * (`?repository=&limit=20`), each with its status, its kind (`group`: the automation kind, or a
 * maintenance group), its trigger, when it started, how many changes it sent, the release request
 * it belongs to (a uuid, or the sentinels `converged` and `refused`) and its `message`.
 */
export const REPOSITORY_BUMPS = [
  '[].id',
  '[].group',
  '[].trigger',
  '[].status',
  '[].startedAt',
  '[].releaseRequestId',
  '[].message',
  '[].changes[].name',
] as const;

/** One bump of a repository, cut to what the Depends on page reads. */
export type RepositoryBump = Consumed<ListBumpsResponses[200], typeof REPOSITORY_BUMPS>[number];

/**
 * `MAINTENANCE_REPOSITORY_DEPENDENTS` (qits-2334): who embeds what one repository publishes, per
 * published artifact (its ecosystem, name and latest version): each released artifact of ours whose
 * newest release embeds it (`artifactEcosystem`, `artifactName`, `artifactVersion`), its repository,
 * the version it embeds, and whether directly.
 */
export const REPOSITORY_DEPENDENTS = [
  'artifacts[].ecosystem',
  'artifacts[].name',
  'artifacts[].latest',
  'artifacts[].dependents[].artifactEcosystem',
  'artifacts[].dependents[].artifactName',
  'artifacts[].dependents[].artifactVersion',
  'artifacts[].dependents[].repository',
  'artifacts[].dependents[].embeddedVersion',
  'artifacts[].dependents[].direct',
] as const;

/** One repository's dependents, cut to what the Dependents page reads. */
export type RepositoryDependents = Consumed<
  ListRepositoryDependentsResponses[200],
  typeof REPOSITORY_DEPENDENTS
>;

/** One published artifact with its dependents, as the Dependents page reads it. */
export type PublishedArtifact = NonNullable<RepositoryDependents['artifacts']>[number];

/**
 * `MAINTENANCE_REPOSITORY_DOWNSTREAM` (qits-2334): every repository downstream of one, upstream
 * first: its name, archetype, how far down it is (`depth`) and the repositories it depends on
 * through (`via`).
 */
export const REPOSITORY_DOWNSTREAM = [
  'downstream[].repository',
  'downstream[].archetype',
  'downstream[].depth',
  'downstream[].via',
] as const;

/** One repository's downstream closure, cut to what the Dependents page reads. */
export type RepositoryDownstream = Consumed<
  GetRepositoryDownstreamResponses[200],
  typeof REPOSITORY_DOWNSTREAM
>;

/**
 * `MAINTENANCE_ADOPTION` (qits-2333): how far one release got, as the adoption page draws it. The
 * release (`repository`, `version`) and what it published (each package's `ecosystem` and
 * `name`), and every repository downstream of it: its name, whether the inventory holds it
 * (`repositoryStatus`: `OK`, `ABSENT`, or none), its archetype, how many hops out it is
 * (`depth`), every parent one hop nearer the release (`via`), and whether it carries the release
 * (`state`: ADOPTED, PENDING), with which of its own releases first did (`adoptedVersion`) and
 * when (`adoptedAt`).
 */
export const ADOPTION = [
  'repository',
  'version',
  'packages[].ecosystem',
  'packages[].name',
  'adopters[].repository',
  'adopters[].repositoryStatus',
  'adopters[].archetype',
  'adopters[].depth',
  'adopters[].via',
  'adopters[].state',
  'adopters[].adoptedVersion',
  'adopters[].adoptedAt',
] as const;

/** One release's adoption journey, cut to what the adoption page reads. */
export type AdoptionJourney = Consumed<GetAdoptionByReleaseResponses[200], typeof ADOPTION>;

/** One repository downstream of the release, as the adoption page draws its card. */
export type Adopter = NonNullable<AdoptionJourney['adopters']>[number];

/**
 * `MAINTENANCE_ARTIFACT_VERSIONS` (qits-2490): every released version of one artifact
 * (`?ecosystem=&name=`, the name in `mt_pin` spelling: maven `groupId:artifactId`, npm
 * `@scope/name`), newest release first, as the npm and maven package pages show it beside each
 * version row: the version, whether its SBOM was read (`sbomStatus`: PENDING, INGESTED, MISSING,
 * FAILED), a FAILED read's reason (`sbomError`) and when the SBOM was read (`ingestedAt`).
 */
export const ARTIFACT_VERSIONS = [
  '[].version',
  '[].sbomStatus',
  '[].sbomError',
  '[].ingestedAt',
] as const;

/** One released version of an artifact, cut to what the package pages read. */
export type ArtifactVersionStatus = Consumed<
  ListArtifactVersionsResponses[200],
  typeof ARTIFACT_VERSIONS
>[number];

/**
 * `MAINTENANCE_INGEST_SBOM` (qits-2490): a version's SBOM read again binds the 202 only; the page
 * reads nothing of the body (the artifact row's id) and reads the versions again instead.
 */
export const INGEST_SBOM = [] as const;
