import type { GetSwarmServiceResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of one swarm service (qits-2345): `SWARM_SERVICE`
 * (`swarm-service.operations.ts`) declares it as `consumes`, so nothing else can be read, and its
 * pact spec binds the same list. To read another field, add it here.
 *
 * Not a task's `nodeId` or `updatedAt` (the door always answers both `null`), nor its `name`
 * (the service's name and the slot say it).
 */
export const GET_SWARM_SERVICE = [
  'id',
  'name',
  'image',
  'mode',
  'replicas',
  'ports',
  'createdAt',
  'updatedAt',
  'labels',
  'envKeys',
  'networks[].networkId',
  'networks[].address',
  'mounts[].type',
  'mounts[].source',
  'mounts[].target',
  'mounts[].readOnly',
  'updateOrder',
  'updateParallelism',
  'updateFailureAction',
  'restartCondition',
  'healthcheck',
  'tasks[].id',
  'tasks[].slot',
  'tasks[].nodeHostname',
  'tasks[].state',
  'tasks[].desiredState',
  'tasks[].error',
  'tasks[].image',
] as const;

/** One swarm service, cut to what its page reads. */
export type SwarmServiceDetail = Consumed<GetSwarmServiceResponses[200], typeof GET_SWARM_SERVICE>;

/** One of a service's tasks, as its page reads it. */
export type SwarmServiceTask = NonNullable<SwarmServiceDetail['tasks']>[number];

/** One of a service's mounts, as its page reads it. */
export type SwarmServiceMount = NonNullable<SwarmServiceDetail['mounts']>[number];

/** One of a service's network attachments, as its page reads it. */
export type SwarmServiceNetwork = NonNullable<SwarmServiceDetail['networks']>[number];
