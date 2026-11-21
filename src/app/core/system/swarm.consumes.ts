import type {
  ListSwarmConfigsResponses,
  ListSwarmNodesResponses,
  ListSwarmServicesResponses,
} from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's swarm (qits-2344, qits-2346, qits-2348): `SWARM_SERVICE_LIST`,
 * `SWARM_NODE_LIST` and `SWARM_CONFIG_LIST` (`swarm.operations.ts`) declare it as `consumes`, so
 * nothing else can be read, and their pact spec binds the same lists. To read another field, add it here.
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
 * `SWARM_CONFIG_LIST` (qits-2348): the swarm's configs, for the System section's configs page.
 * `createdAt`/`updatedAt` are docker's text as given (a humanized age on real docker), shown as is.
 */
export const LIST_SWARM_CONFIGS = [
  '[].id',
  '[].name',
  '[].createdAt',
  '[].updatedAt',
  '[].labels',
] as const;

/** One swarm config, cut to what the page reads. */
export type SwarmConfig = Consumed<
  ListSwarmConfigsResponses[200],
  typeof LIST_SWARM_CONFIGS
>[number];
