import type { ListTargetsResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What `TargetsStore` reads from qits-system's answer (epic qits-112). The store passes this to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 */

/**
 * `TargetsStore.load()`: every execution target, for the runners and slots line of the lightning
 * menu. `used` and `reservations` are read whole, so a new slot type shows without a code change.
 * `TargetsStore` maps `reservations` to `reserved`.
 */
export const LIST_TARGETS = [
  '[].connected',
  '[].slotsTotal',
  '[].used',
  '[].reservations',
] as const;

/** One target, cut to what the store reads. */
export type TargetEntry = Consumed<ListTargetsResponses[200], typeof LIST_TARGETS>[number];
