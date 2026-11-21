import { qitsOperation } from '@qits/angular';
import { listSwarmNodes, listSwarmSecrets, listSwarmServices } from '../../api/system';
import { LIST_SWARM_NODES, LIST_SWARM_SECRETS, LIST_SWARM_SERVICES } from './swarm.consumes';

/**
 * qits-system's swarm (qits-2344, qits-2346, qits-2350) declared as operations, read by the System section's pages
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

/**
 * `SWARM_SECRET_LIST` (qits-2350): `docker secret ls` on the manager qits-system runs on, one swarm,
 * in docker's order, each secret with the services whose spec references it (read from the
 * services' specs, never from the secret: qits-system never inspects one); `[]` when it holds none,
 * a 503 when the swarm cannot be read, a 403 for a role that may not read it. No value, ever.
 */
export const SWARM_SECRET_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listSwarmSecrets',
  method: 'GET',
  call: listSwarmSecrets,
  consumes: LIST_SWARM_SECRETS,
});
