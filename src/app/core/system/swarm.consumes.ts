import type { ListSwarmServicesResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's swarm (qits-2344): `SWARM_SERVICE_LIST`
 * (`swarm.operations.ts`) declares it as `consumes`, so nothing else can be read, and its pact
 * spec binds the same list. To read another field, add it here.
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
