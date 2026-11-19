import { qitsOperation } from '@qits/angular';
import {
  getMaintenanceApiDependencies,
  getMaintenanceApiRepositories,
  listPendingBumps,
} from '../../api/maintenance';
import { LIST_DEPENDENCIES, LIST_PENDING_BUMPS, LIST_REPOSITORIES } from './maintenance.consumes';

/**
 * qits-maintenance's reads declared as operations (qits-2145), for the top bar's bumps menu, which
 * reads through `qitsResource` instead of a store (qits-2146), and for the Maintenance section's
 * Dependencies page (qits-2317); `maintenance.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`.
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
 * Every repository of the inventory, with the project it belongs to (`listRepositories`; the
 * generated client names it after its path). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_REPOSITORIES = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listRepositories',
  method: 'GET',
  call: getMaintenanceApiRepositories,
  consumes: LIST_REPOSITORIES,
});

/**
 * The dependencies of one kind with every pin of each (`listDependencies?kind=`; the generated
 * client names it after its path). Only staff roles may read it; anyone else gets a 403.
 */
export const MAINTENANCE_DEPENDENCIES = qitsOperation({
  provider: 'qits-maintenance-service',
  operationId: 'listDependencies',
  method: 'GET',
  call: getMaintenanceApiDependencies,
  consumes: LIST_DEPENDENCIES,
});
