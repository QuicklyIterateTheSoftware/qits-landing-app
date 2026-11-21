import { qitsOperation } from '@qits/angular';
import { listNodeVolumes } from '../../api/system';
import { LIST_NODE_VOLUMES, NODE_VOLUMES_REFUSAL } from './node-volumes.consumes';

/**
 * `NODE_VOLUME_LIST` (qits-2355): `docker volume ls` on the node qits-system runs on, by the node's
 * id, in docker's order, each volume marked `unused` when no container on the node references it;
 * `[]` when the node holds none. Any other node is a 409 `NODE_REMOTE` (only the local node is
 * reachable in this version), a 403 a role that may not read the swarm.
 * `node-volumes.operations.pact.spec.ts` binds it.
 */
export const NODE_VOLUME_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listNodeVolumes',
  method: 'GET',
  call: listNodeVolumes,
  consumes: LIST_NODE_VOLUMES,
  errorConsumes: NODE_VOLUMES_REFUSAL,
});
