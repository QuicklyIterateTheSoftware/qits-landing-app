import { qitsOperation } from '@qits/angular';
import { getSwarmService } from '../../api/system';
import { GET_SWARM_SERVICE } from './swarm-service.consumes';

/**
 * One swarm service (qits-2345) declared as an operation, read by the System section's service
 * page through its own `qitsResource`; `swarm-service.operations.pact.spec.ts` binds it.
 *
 * `SWARM_SERVICE`: `docker service inspect` and the service's tasks on the manager qits-system
 * runs on, by the service's name or id; a 404 when the swarm runs no such service.
 */
export const SWARM_SERVICE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getSwarmService',
  method: 'GET',
  call: getSwarmService,
  consumes: GET_SWARM_SERVICE,
});
