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

/**
 * A quarantined target in the list: no `@qits/system-golden-masters` recording holds one yet, so
 * the Greenlight test skips itself until qits-system records `listTargets` in this state.
 */
export const QUARANTINED = 'a quarantined target';

/**
 * The terminals' states (qits-2356): no terminal is open (`openTerminal` 201; `getTerminal` 404
 * from the pin that records qits-2356's states).
 */
export const NO_TERMINAL = 'no terminal';

/** One open exec terminal, `sh` in `dev-qits-ci.1.…`: `getTerminal` 200 and `closeTerminal` 204. */
export const AN_OPEN_EXEC_TERMINAL = 'an open exec terminal';

/**
 * A stopped container, `a-stopped-one`: `openTerminal` 409 (`container a-stopped-one is not
 * running`), from the pin that records qits-2356's states.
 */
export const A_STOPPED_CONTAINER = 'a stopped container';
