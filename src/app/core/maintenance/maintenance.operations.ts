import { qitsOperation } from '@qits/angular';
import {
  getBump,
  listArtifacts,
  listDependencies,
  listDependencyDependents,
  listRepositories,
  listPendingBumps,
} from '../../api/maintenance';
import {
  BUMP,
  DEPENDENTS_REFUSAL,
  LIST_ARTIFACTS,
  LIST_DEPENDENCIES,
  LIST_DEPENDENCY_DEPENDENTS,
  LIST_PENDING_BUMPS,
  LIST_REPOSITORIES,
} from './maintenance.consumes';

/**
 * qits-maintenance's reads declared as operations (qits-2145), for the top bar's bumps menu, which
 * reads through `qitsResource` instead of a store (qits-2146), and for the Maintenance section's
 * Dependencies page (qits-2317), Artifacts page (qits-2330) and bump page (qits-2332);
 * `maintenance.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
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
 * Every repository of the inventory, with the project it belongs to (`listRepositories`). Only
 * staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_REPOSITORIES = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listRepositories',
  method: 'GET',
  call: listRepositories,
  consumes: LIST_REPOSITORIES,
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
