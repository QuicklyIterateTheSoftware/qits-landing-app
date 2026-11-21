import type { ListNodeNetworksResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the swarm node page's Networks tab reads of qits-system's node networks (qits-2354):
 * `NODE_NETWORK_LIST` (`node-networks.operations.ts`) declares it as `consumes`, so nothing else can
 * be read, and its pact spec binds the same list. Not `ipv6`: the tab does not show it (the old
 * page did not either). To read another field, add it here.
 */
export const LIST_NODE_NETWORKS = [
  '[].id',
  '[].name',
  '[].driver',
  '[].scope',
  '[].internal',
  '[].createdAt',
  '[].labels',
] as const;

/** One docker network of the node, cut to what the tab reads. */
export type NodeNetwork = Consumed<
  ListNodeNetworksResponses[200],
  typeof LIST_NODE_NETWORKS
>[number];

/**
 * What the Networks tab reads of a refusal (qits-2354): qits-system's `ErrorBody`, its `code`
 * (`NODE_REMOTE`: only the node qits-system runs on is reachable) and its `message`.
 */
export const NODE_NETWORKS_REFUSAL = ['code', 'message'] as const;
