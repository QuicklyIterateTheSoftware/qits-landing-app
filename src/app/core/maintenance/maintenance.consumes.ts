import type { ListPendingBumpsResponses } from '../../api/maintenance';
import type { Consumed } from '@qits/angular';

/**
 * What `MaintenanceStore` reads from qits-maintenance's answer (epic qits-112). The store passes
 * this to `consume(...)`, so it cannot read any other field, and its pact spec passes the same list
 * as `consumes`. To read another field, add it here.
 */

/** How many pending bumps the bumps menu asks for: the newest, one page. */
export const PENDING_BUMPS = 20;

/**
 * `MaintenanceStore.load()`: the newest bumps still on their way, of every repository, for the top
 * bar's bumps menu. Each row shows the repository, what moves (each change's dependency, ecosystem
 * and versions), the bump's mode, and how it stands: its run, or once green, its release.
 */
export const LIST_PENDING_BUMPS = [
  'bumps[].id',
  'bumps[].repository',
  'bumps[].mode',
  'bumps[].status',
  'bumps[].releaseState',
  'bumps[].changes[].ecosystem',
  'bumps[].changes[].name',
  'bumps[].changes[].from',
  'bumps[].changes[].to',
] as const;

/** One pending bump, cut to what the store reads. */
export type BumpEntry = NonNullable<
  Consumed<ListPendingBumpsResponses[200], typeof LIST_PENDING_BUMPS>['bumps']
>[number];
