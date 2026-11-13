import type { ListTargetsResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-system's answer (epic qits-112): `TARGET_LIST`
 * (`targets.operations.ts`) declares it as `consumes`, so nothing else can be read, and its pact
 * spec binds the same list. To read another field, add it here.
 */

/**
 * `TARGET_LIST`: every execution target, for the runners and slots line of the lightning menu.
 * `used` and `reservations` are read whole, so a new slot type shows without a code change.
 * `targetOf` maps `reservations` to `reserved`.
 */
export const LIST_TARGETS = [
  '[].connected',
  '[].slotsTotal',
  '[].used',
  '[].reservations',
] as const;

/** One target, cut to what the store reads. */
export type TargetEntry = Consumed<ListTargetsResponses[200], typeof LIST_TARGETS>[number];
