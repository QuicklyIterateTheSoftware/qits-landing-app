import type {
  ListSwarmNodesResponses,
  ListSwarmSecretsResponses,
  ListSwarmServicesResponses,
} from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's swarm (qits-2344, qits-2346, qits-2350): `SWARM_SERVICE_LIST`,
 * `SWARM_NODE_LIST` and `SWARM_SECRET_LIST` (`swarm.operations.ts`) declare it as `consumes`, so
 * nothing else can be read, and their pact spec binds the same lists. To read another field, add it
 * here.
 */

/**
 * `SWARM_SERVICE_LIST`: the swarm's services, for the System section's services page. Not
 * `updatedAt`: the list door always answers it `null` (only a service's own detail fills it).
 */
export const LIST_SWARM_SERVICES = [
  '[].id',
  '[].name',
  '[].mode',
  '[].replicas',
  '[].image',
  '[].ports',
] as const;

/** One swarm service, cut to what the page reads. */
export type SwarmService = Consumed<
  ListSwarmServicesResponses[200],
  typeof LIST_SWARM_SERVICES
>[number];

/**
 * `SWARM_NODE_LIST` (qits-2346): the swarm's nodes, for the System section's nodes page. Not
 * `address`: the list door always answers it `null` (`docker node ls` prints no address; only a
 * node's own detail fills it).
 */
export const LIST_SWARM_NODES = [
  '[].id',
  '[].hostname',
  '[].role',
  '[].status',
  '[].availability',
  '[].managerStatus',
  '[].engineVersion',
  '[].self',
] as const;

/** One swarm node, cut to what the page reads. */
export type SwarmNode = Consumed<ListSwarmNodesResponses[200], typeof LIST_SWARM_NODES>[number];

/**
 * `SWARM_SECRET_LIST` (qits-2350): the swarm's secrets, for the System section's secrets page. No
 * value: the swarm returns a secret's value to no one, and the door answers none. Not `driver`:
 * always empty on this estate (no external secret drivers). `createdAt` and `updatedAt` are
 * docker's `secret ls` text ("2 months ago"), not timestamps; `usedBy` names the services whose
 * spec references the secret (`[]`: none).
 */
export const LIST_SWARM_SECRETS = [
  '[].id',
  '[].name',
  '[].createdAt',
  '[].updatedAt',
  '[].labels',
  '[].usedBy',
] as const;

/** One swarm secret, cut to what the page reads. */
export type SwarmSecret = Consumed<
  ListSwarmSecretsResponses[200],
  typeof LIST_SWARM_SECRETS
>[number];
