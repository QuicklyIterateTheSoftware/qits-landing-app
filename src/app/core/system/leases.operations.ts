import { qitsOperation } from '@qits/angular';
import { listLeases } from '../../api/system';
import { LIST_TARGET_LEASES } from './leases.consumes';

/**
 * qits-system's leases declared as an operation (qits-2351), read by a target's card on the
 * Targets page when its Leases open, `listLeases?targetId=`, through its own `qitsResource`;
 * `leases.operations.pact.spec.ts` binds it. A read role may read it (an agent may).
 */
export const TARGET_LEASES = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listLeases',
  method: 'GET',
  call: listLeases,
  consumes: LIST_TARGET_LEASES,
});
