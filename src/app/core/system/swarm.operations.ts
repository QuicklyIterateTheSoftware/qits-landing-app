import { qitsOperation } from '@qits/angular';
import {
  getSwarmNode,
  listSwarmConfigs,
  listSwarmNodes,
  listSwarmNodeTasks,
  listSwarmServices,
} from '../../api/system';
import {
  GET_SWARM_NODE,
  LIST_SWARM_CONFIGS,
  LIST_SWARM_NODE_TASKS,
  LIST_SWARM_NODES,
  LIST_SWARM_SERVICES,
} from './swarm.consumes';

/**
 * qits-system's swarm (qits-2344, qits-2346, qits-2347, qits-2348) declared as operations, read by the System section's pages
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
 * `SWARM_NODE` (qits-2347): `docker node inspect` on the manager qits-system runs on, by the node's
 * id or hostname, in the list's vocabulary (`Ready`, `Active`) and marked `self` on the node
 * qits-system runs on; a 404 when the swarm has no such node.
 */
export const SWARM_NODE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getSwarmNode',
  method: 'GET',
  call: getSwarmNode,
  consumes: GET_SWARM_NODE,
});

/**
 * `SWARM_NODE_TASKS` (qits-2347): `docker node ps` on the manager, the tasks swarm placed on one
 * node in docker's order (newest first per slot), shut-down history included; `[]` when it runs
 * none, a 404 when the swarm has no such node.
 */
export const SWARM_NODE_TASKS = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listSwarmNodeTasks',
  method: 'GET',
  call: listSwarmNodeTasks,
  consumes: LIST_SWARM_NODE_TASKS,
});

/**
 * `SWARM_CONFIG_LIST` (qits-2348): `docker config ls` on the manager qits-system runs on, one
 * swarm, in docker's order; `createdAt`/`updatedAt` are docker's own text (a humanized age such as
 * `2 months ago`, not an instant); `[]` when the swarm holds none, a 503 when the swarm cannot be
 * read, a 403 for a role that may not read it.
 */
export const SWARM_CONFIG_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listSwarmConfigs',
  method: 'GET',
  call: listSwarmConfigs,
  consumes: LIST_SWARM_CONFIGS,
});
