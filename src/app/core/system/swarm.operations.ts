import { qitsOperation } from '@qits/angular';
import { listSwarmServices } from '../../api/system';
import { LIST_SWARM_SERVICES } from './swarm.consumes';

/**
 * qits-system's swarm (qits-2344) declared as operations, read by the System section's pages
 * through their own `qitsResource`; `swarm.operations.pact.spec.ts` binds them.
 *
 * `SWARM_SERVICE_LIST`: `docker service ls` on the manager qits-system runs on, one swarm, not per
 * target; `[]` when it runs none, a 503 quoting docker when the swarm cannot be read.
 */
export const SWARM_SERVICE_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listSwarmServices',
  method: 'GET',
  call: listSwarmServices,
  consumes: LIST_SWARM_SERVICES,
});
