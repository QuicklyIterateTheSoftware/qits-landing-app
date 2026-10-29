/**
 * The qits-system events that can change what `TargetsStore` holds: a lease granted, started or
 * ended moves a target's `used` counts; a login check follows a runner's hello on each connection;
 * a runner's connection coming up or dropping refreshes `connected`.
 */
export const TARGET_EVENTS = [
  'TargetLeaseChanged',
  'TargetLoginChanged',
  'TargetConnectionChanged',
] as const;
