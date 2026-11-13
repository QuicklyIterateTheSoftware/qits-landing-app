import { qitsOperation } from '@qits/angular';
import { listPendingBumps } from '../../api/maintenance';
import { LIST_PENDING_BUMPS } from './maintenance.consumes';

/**
 * qits-maintenance's reads declared as operations (qits-2145), for the top bar's bumps menu, which
 * reads through `qitsResource` instead of a store (qits-2146);
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
