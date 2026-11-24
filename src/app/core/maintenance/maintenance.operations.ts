import { qitsOperation } from '@qits/angular';
import {
  getAdoptionByRelease,
  getBump,
  getRepository,
  getRepositoryDownstream,
  ingestArtifactSbom,
  listArtifacts,
  listArtifactVersions,
  listBumps,
  listDependencies,
  listDependencyDependents,
  listPendingBumps,
  listRepositoryDependents,
} from '../../api/maintenance';
import {
  ADOPTION,
  ARTIFACT_VERSIONS,
  BUMP,
  INGEST_SBOM,
  DEPENDENTS_REFUSAL,
  LIST_ARTIFACTS,
  LIST_DEPENDENCIES,
  LIST_DEPENDENCY_DEPENDENTS,
  LIST_PENDING_BUMPS,
  REPOSITORY,
  REPOSITORY_BUMPS,
  REPOSITORY_DEPENDENTS,
  REPOSITORY_DOWNSTREAM,
} from './maintenance.consumes';

/**
 * qits-maintenance's reads declared as operations (qits-2145), for the top bar's bumps menu, which
 * reads through `qitsResource` instead of a store (qits-2146), for a repository's pages (its
 * published artifacts, qits-2478; its Depends on and Dependents, qits-2489, once qits-2334's
 * repository page; a bump, qits-2332; a release's adoption, qits-2333) and for the Mirror
 * section's package releases (qits-2488), and for the npm and maven package pages' SBOM status per
 * version and its re-read (qits-2490); `maintenance.operations.pact.spec.ts` binds each with
 * the same provider, operationId and `consumes`. The Maintenance section's listings that first
 * read them (qits-2317, qits-2330) are gone (qits-2489).
 */

/** The newest pending version bumps (`listPendingBumps?limit=`), the bumps menu's list. */
export const PENDING_BUMPS_LIST = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listPendingBumps',
  method: 'GET',
  call: listPendingBumps,
  consumes: LIST_PENDING_BUMPS,
});

/**
 * The dependencies of one kind with every pin of each (`listDependencies?kind=`). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_DEPENDENCIES = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listDependencies',
  method: 'GET',
  call: listDependencies,
  consumes: LIST_DEPENDENCIES,
});

/**
 * Every artifact the platform has released, with its newest release, its SBOM's status and how
 * many of ours embed it, how many an older copy (`listArtifacts`). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_ARTIFACTS = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listArtifacts',
  method: 'GET',
  call: listArtifacts,
  consumes: LIST_ARTIFACTS,
});

/**
 * One artifact's dependents: every released artifact of ours whose newest release embeds it, read
 * off the SBOMs (`listDependencyDependents?ecosystem=&name=`). Only maven, npm and docker are read: any other ecosystem (a daemon) is a 400 whose
 * `message` says so. Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_DEPENDENTS = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listDependencyDependents',
  method: 'GET',
  call: listDependencyDependents,
  consumes: LIST_DEPENDENCY_DEPENDENTS,
  errorConsumes: DEPENDENTS_REFUSAL,
});

/**
 * One bump with the changes it sent (`getBump`, `/maintenance/api/bumps/{id}`), the bump page's one
 * read (qits-2332): no project filter, the id is the whole address. An id the service does not
 * know is a 404, which the page says as "No bump <id>." (status only: the page reads nothing of
 * the body). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_BUMP = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'getBump',
  method: 'GET',
  call: getBump,
  consumes: BUMP,
});

/**
 * One repository of the inventory with its pins and transitives (`getRepository`,
 * `/maintenance/api/repositories/{name}`), the Depends on page's main read (qits-2334, qits-2489): keyed by
 * the repository's name (`qits-ci-service`, never the application `qits-ci`). A name the inventory
 * does not hold is a 404, which the page says as "No repository <name> in the inventory." (status
 * only: the page reads nothing of the body). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_REPOSITORY = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'getRepository',
  method: 'GET',
  call: getRepository,
  consumes: REPOSITORY,
});

/**
 * The newest bumps of one repository (`listBumps?repository=&limit=20`), the Depends on page's
 * recent bumps (qits-2334). An unknown repository answers an empty list. Only staff roles may read
 * it; anyone else gets a 403.
 */
export const MAINTENANCE_REPOSITORY_BUMPS = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listBumps',
  method: 'GET',
  call: listBumps,
  consumes: REPOSITORY_BUMPS,
});

/**
 * Who embeds what one repository publishes, per published artifact
 * (`listRepositoryDependents`, `/maintenance/api/repositories/{name}/dependents`), the Dependents
 * page's dependents (qits-2334). An unknown repository answers no artifacts. Only staff roles may
 * read it; anyone else gets a 403.
 */
export const MAINTENANCE_REPOSITORY_DEPENDENTS = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listRepositoryDependents',
  method: 'GET',
  call: listRepositoryDependents,
  consumes: REPOSITORY_DEPENDENTS,
});

/**
 * Everything downstream of one repository, upstream first (`getRepositoryDownstream`,
 * `/maintenance/api/repositories/{name}/downstream`), the Dependents page's downstream closure
 * (qits-2334). An unknown repository answers an empty closure. Only staff roles may read it; anyone
 * else gets a 403.
 */
export const MAINTENANCE_REPOSITORY_DOWNSTREAM = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'getRepositoryDownstream',
  method: 'GET',
  call: getRepositoryDownstream,
  consumes: REPOSITORY_DOWNSTREAM,
});

/**
 * How far one release got (`getAdoptionByRelease`, `/maintenance/api/adoption/by-release?repository=&version=`),
 * the adoption page's one read (qits-2333): the release, what it published, and every repository
 * downstream of it with whether it carries the release yet. The service traces the whole closure
 * per request, so this one answer is the whole journey. No project filter: the release is the
 * whole address. Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_ADOPTION = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'getAdoptionByRelease',
  method: 'GET',
  call: getAdoptionByRelease,
  consumes: ADOPTION,
});

/**
 * Every released version of one artifact with its SBOM's status (`listArtifactVersions`,
 * `/maintenance/api/artifacts/versions?ecosystem=&name=`), newest release first: the npm and maven
 * package pages' status per version row (qits-2490). The name is in `mt_pin` spelling, which is
 * the package pages' own (maven `groupId:artifactId`, npm `@scope/name`). An artifact nothing
 * released answers an empty list; an unknown ecosystem or no name is a 400. Staff roles and
 * `qits:agent` may read it; anyone else gets a 403.
 */
export const MAINTENANCE_ARTIFACT_VERSIONS = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listArtifactVersions',
  method: 'GET',
  call: listArtifactVersions,
  consumes: ARTIFACT_VERSIONS,
});

/**
 * Reads one released version's SBOM again, now (`ingestArtifactSbom`, `POST
 * /maintenance/api/artifacts/ingest`, body `{ ecosystem, name, version }`): 202 once queued; the
 * read itself happens after the answer, so the row turns PENDING and then INGESTED, MISSING or
 * FAILED (no event says so: the page reads the versions again). The package pages' Re-read SBOM
 * (qits-2490). Only admin and desk roles and `qits:system` may send it (not `qits:agent`); anyone
 * else gets a 403.
 */
export const MAINTENANCE_INGEST_SBOM = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'ingestArtifactSbom',
  method: 'POST',
  call: ingestArtifactSbom,
  consumes: INGEST_SBOM,
});
