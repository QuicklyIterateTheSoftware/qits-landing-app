/**
 * The qits-system events that can change what `TargetsStore` holds: a lease granted, started or
 * ended moves a target's `used` counts; a login check follows a runner's hello on each connection.
 * qits-system sends no event when a runner connects or drops, so `connected` can be stale until
 * one of these arrives.
 */
export const TARGET_EVENTS = ['TargetLeaseChanged', 'TargetLoginChanged'] as const;
