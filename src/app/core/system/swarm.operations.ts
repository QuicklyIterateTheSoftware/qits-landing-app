import { qitsOperation } from '@qits/angular';
import { listSwarmNodes, listSwarmServices } from '../../api/system';
import { LIST_SWARM_NODES, LIST_SWARM_SERVICES } from './swarm.consumes';

/**
 * qits-system's swarm (qits-2344, qits-2346) declared as operations, read by the System section's pages
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

/**
 * `SWARM_NODE_LIST` (qits-2346): `docker node ls` on the manager qits-system runs on, one swarm, in
 * docker's order, the node qits-system runs on marked `self`; `[]` when the manager lists none, a
 * 503 when the swarm cannot be read, a 403 for a role that may not read it.
 */
export const SWARM_NODE_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listSwarmNodes',
  method: 'GET',
  call: listSwarmNodes,
  consumes: LIST_SWARM_NODES,
});
