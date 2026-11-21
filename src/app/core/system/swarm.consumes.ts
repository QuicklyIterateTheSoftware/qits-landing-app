import type {
  GetSwarmNodeResponses,
  ListSwarmConfigsResponses,
  ListSwarmNodesResponses,
  ListSwarmNodeTasksResponses,
  ListSwarmSecretsResponses,
  ListSwarmServicesResponses,
} from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's swarm (qits-2344, qits-2346, qits-2347, qits-2348,
 * qits-2350): `SWARM_SERVICE_LIST`, `SWARM_NODE_LIST`, `SWARM_NODE`, `SWARM_NODE_TASKS`,
 * `SWARM_CONFIG_LIST` and `SWARM_SECRET_LIST` (`swarm.operations.ts`) declare it as `consumes`, so
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
 * `SWARM_NODE` (qits-2347): one node, for its page. Not `updatedAt`: the page shows when the node
 * joined, not when docker last touched its record.
 */
export const GET_SWARM_NODE = [
  'id',
  'hostname',
  'role',
  'status',
  'availability',
  'managerStatus',
  'engineVersion',
  'address',
  'os',
  'architecture',
  'cpus',
  'memoryBytes',
  'labels',
  'createdAt',
  'self',
] as const;

/** One swarm node, cut to what its page reads. */
export type SwarmNodeDetail = Consumed<GetSwarmNodeResponses[200], typeof GET_SWARM_NODE>;

/**
 * `SWARM_NODE_TASKS` (qits-2347): the tasks swarm placed on one node, for its page. Not `nodeId` or
 * `updatedAt` (the door always answers both `null`), nor `nodeHostname` (it is the page's node).
 */
export const LIST_SWARM_NODE_TASKS = [
  '[].id',
  '[].name',
  '[].slot',
  '[].state',
  '[].desiredState',
  '[].error',
  '[].image',
] as const;

/** One of a node's tasks, as its page reads it. */
export type SwarmNodeTask = Consumed<
  ListSwarmNodeTasksResponses[200],
  typeof LIST_SWARM_NODE_TASKS
>[number];

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
