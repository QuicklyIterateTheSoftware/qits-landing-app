/**
 * The qits-system provider states the Targets page's specs read (qits-2351), named once so the
 * pact specs and the browser spec cannot drift apart, and so a state qits-system renames is
 * switched in one place.
 */

/** No target is declared: `createTarget` 201, `getTargetInstallScript`, and an empty `listTargets`. */
export const NO_TARGET = 'no target';

/** One connected target holding a CI and a WORKSPACE lease: `listTargets`, `listLeases?targetId=`. */
export const CONNECTED_WITH_LEASES = 'a connected target with leases';

/** One declared, disconnected target: its reads and writes, and the two checks' 409s. */
export const DECLARED = 'a declared target';

/** One connected target: `startTargetSignIn` 202, and the two checks' 202s. */
export const CONNECTED = 'a connected target';

/** A connected target whose claude sign-in waits for its code: get, submit, cancel. */
export const AWAITING_CODE = 'a connected target with a claude sign-in awaiting its code';

/** A registered runner: `rotateTargetRegistrationToken` with a slots total. */
export const REGISTERED_RUNNER = 'a registered runner';
