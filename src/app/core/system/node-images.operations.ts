import { qitsOperation } from '@qits/angular';
import { listNodeImages } from '../../api/system';
import { LIST_NODE_IMAGES, NODE_IMAGES_REFUSAL } from './node-images.consumes';

/**
 * qits-system's images of one swarm node (qits-2353), declared as an operation, read by the node
 * page's Images tab through its own `qitsResource`; `node-images.operations.pact.spec.ts` binds it.
 *
 * `NODE_IMAGE_LIST`: `docker image ls` on the daemon qits-system runs on, by the node's id (or the
 * alias `local`), in docker's order (newest first); `[]` when the node holds none, a 409
 * `NODE_REMOTE` (`code`, `message`) for any other node of the swarm, a 503 when the daemon cannot
 * be read, a 403 for a role that may not read it. `createdAt` is docker's Go rendering
 * (`2026-08-18 04:46:43 +0200 CEST`), read with `dockerInstant`.
 */
export const NODE_IMAGE_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listNodeImages',
  method: 'GET',
  call: listNodeImages,
  consumes: LIST_NODE_IMAGES,
  errorConsumes: NODE_IMAGES_REFUSAL,
});
