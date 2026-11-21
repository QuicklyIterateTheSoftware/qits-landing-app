import type { ListLeasesResponses } from '../../api/system';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads of qits-system's leases (qits-2351): `TARGET_LEASES` (`leases.operations.ts`)
 * declares it as `consumes`, so nothing else can be read, and its pact spec binds the same list.
 *
 * `TARGET_LEASES`: one target's leases, for its card's Leases table on the Targets page: each
 * lease by id, its slot type, who holds it (the owner app and its ref), its state and why.
 */
export const LIST_TARGET_LEASES = [
  '[].id',
  '[].slotType',
  '[].ownerApp',
  '[].ownerRef',
  '[].state',
  '[].detail',
] as const;

/** One lease, cut to what the card reads. */
export type TargetLease = Consumed<ListLeasesResponses[200], typeof LIST_TARGET_LEASES>[number];
