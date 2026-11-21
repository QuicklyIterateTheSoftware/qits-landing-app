import { qitsOperation } from '@qits/angular';
import { listNodeNetworks } from '../../api/system';
import { LIST_NODE_NETWORKS, NODE_NETWORKS_REFUSAL } from './node-networks.consumes';

/**
 * qits-system's node networks (qits-2354) declared as an operation, read by the swarm node page's
 * Networks tab through its own `qitsResource`; `node-networks.operations.pact.spec.ts` binds it.
 *
 * `NODE_NETWORK_LIST`: `docker network ls` on the node qits-system runs on, in docker's order, each
 * network with its driver, scope, `internal` flag, docker's creation date (Go's layout,
 * `2026-08-15 06:44:01.671795447 +0000 UTC`) and labels; `[]` when docker lists none. Only that
 * node is reachable: another node's networks answer 409 `NODE_REMOTE` with a `message`
 * (`NODE_NETWORKS_REFUSAL`, its `errorConsumes`). A 403 for a role that may
 * not read the swarm.
 */
export const NODE_NETWORK_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listNodeNetworks',
  method: 'GET',
  call: listNodeNetworks,
  consumes: LIST_NODE_NETWORKS,
  errorConsumes: NODE_NETWORKS_REFUSAL,
});
