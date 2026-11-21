import { qitsOperation } from '@qits/angular';
import { getContainerLogs, listNodeContainers } from '../../api/system';
import {
  CONTAINER_LOGS,
  LIST_NODE_CONTAINERS,
  NODE_CONTAINERS_REFUSAL,
} from './node-containers.consumes';

/**
 * The containers of the swarm node qits-system runs on (qits-2352), declared as operations, read by
 * the node page's Containers tab through its own `qitsResource`;
 * `node-containers.operations.pact.spec.ts` binds them.
 *
 * `NODE_CONTAINER_LIST`: `docker ps -a --no-trunc` on the local daemon, newest first, always with
 * `all=true` ({@link nodeContainersParams}): the tab counts and filters running and stopped
 * containers from that one read. `[]` when there are none; a 409 `NODE_REMOTE` for a node other
 * than the one qits-system runs on (only the local daemon is reachable), whose `code` and
 * `message` the tab reads; a 403 for a role that may not read the swarm.
 */
export const NODE_CONTAINER_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listNodeContainers',
  method: 'GET',
  call: listNodeContainers,
  consumes: LIST_NODE_CONTAINERS,
  errorConsumes: NODE_CONTAINERS_REFUSAL,
});

/** The tab's one read of node `id`'s containers: every one of them, running or not. */
export function nodeContainersParams(id: string) {
  return { path: { id }, query: { all: true } };
}

/**
 * `NODE_CONTAINER_LOGS`: a container's last 200 lines ({@link containerLogsParams}), stdout and
 * stderr together, `truncated` when the service cut them short; a 404 when the container is gone.
 */
export const NODE_CONTAINER_LOGS = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getContainerLogs',
  method: 'GET',
  call: getContainerLogs,
  consumes: CONTAINER_LOGS,
});

/** How many of a container's last lines the log panel reads. */
export const LOG_TAIL = 200;

/** The log panel's read of container `cid` (its name or id) on node `id`. */
export function containerLogsParams(id: string, cid: string) {
  return { path: { id, cid }, query: { tail: LOG_TAIL } };
}
