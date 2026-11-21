import type { GetContainerLogsResponses, ListNodeContainersResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the swarm node's Containers tab (qits-2352) reads of qits-system's node container doors:
 * `NODE_CONTAINER_LIST` and `NODE_CONTAINER_LOGS` (`node-containers.operations.ts`) declare it as
 * `consumes`, so nothing else can be read, and their pact spec binds the same lists. To read
 * another field, add it here.
 */

/**
 * `NODE_CONTAINER_LIST`: every container on the node qits-system runs on (`docker ps -a`), newest
 * first. `createdAt` is docker's Go date (`2026-11-20 21:56:36 +0000 UTC`), read by
 * `dockerInstant`. Not `command`, `networks` or `size` (the tab shows none of them), nor
 * `runningFor` (stale the moment it is read: the tab derives Created from `createdAt`).
 */
export const LIST_NODE_CONTAINERS = [
  '[].id',
  '[].name',
  '[].image',
  '[].state',
  '[].status',
  '[].health',
  '[].createdAt',
  '[].ports',
] as const;

/** One container of the node, cut to what the tab reads. */
export type NodeContainer = Consumed<
  ListNodeContainersResponses[200],
  typeof LIST_NODE_CONTAINERS
>[number];

/**
 * What a refusal of the node's containers says: qits-system's `ErrorBody`, its `code`
 * (`NODE_REMOTE`, a 409 for a node other than the one it runs on) and its `message`.
 */
export const NODE_CONTAINERS_REFUSAL = ['code', 'message'] as const;

/** `NODE_CONTAINER_LOGS`: a container's last lines, and whether the service cut them short. */
export const CONTAINER_LOGS = ['text', 'truncated'] as const;

/** One container's log tail, as the tab's log panel reads it. */
export type ContainerLogTail = Consumed<GetContainerLogsResponses[200], typeof CONTAINER_LOGS>;
