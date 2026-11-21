import type {
  CreateTargetResponses,
  GetTargetSignInResponses,
  ListTargetsResponses,
} from '../../api/system';
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

/**
 * `TARGET_ROWS` (qits-2351): every execution target, for the System section's Targets page, a
 * second read of `listTargets` beside `TARGET_LIST` (whose `show-runner-slots` row stays as it is).
 * Everything a target's card shows: who it is (name, description, the runner's hostname), its
 * connection (since when, last seen, the runner's version), its quarantine, its slots (the total
 * the runner reports, and per type the reservation, the ceiling and the use), each harness's
 * sign-in and the manual commands, the last health check and the node's memory. Not
 * `credentialVolume` or `engineId`: nothing shows them.
 */
export const LIST_TARGET_ROWS = [
  '[].id',
  '[].name',
  '[].description',
  '[].hostname',
  '[].slotsTotal',
  '[].reservations',
  '[].maximums',
  '[].used',
  '[].login',
  '[].loginCommand',
  '[].kimiLoginCommand',
  '[].connected',
  '[].connectedSince',
  '[].lastSeenAt',
  '[].runnerVersion',
  '[].quarantined',
  '[].quarantineReason',
  '[].quarantinedAt',
  '[].lastHealthCheckAt',
  '[].lastHealthCheckOk',
  '[].memory',
] as const;

/** One target, cut to what the Targets page reads. */
export type TargetRow = Consumed<ListTargetsResponses[200], typeof LIST_TARGET_ROWS>[number];

/**
 * What every target write's refusal says (qits-2351): qits-system's `ErrorBody`, its `code`
 * (`TARGET_NAME_TAKEN`, `TARGET_BUSY`, `SIGN_IN_RUNNING`, …) and its `message`, which
 * `target-refusals.ts` turns into the page's words. Each write declares it as its `errorConsumes`.
 */
export const TARGET_REFUSAL = ['code', 'message'] as const;

/**
 * `TARGET_CREATE` and `TARGET_TOKEN_ROTATE` (qits-2351): the one-time install line the answer
 * carries, shown once and never again (the registration token rides inside it). The rest of the
 * answer is the target, which the page reads again from the list instead.
 */
export const TARGET_REGISTRATION = ['installLine'] as const;

/** A registration, cut to what the page reads: its install line. */
export type TargetRegistrationLine = Consumed<
  CreateTargetResponses[201],
  typeof TARGET_REGISTRATION
>;

/**
 * `TARGET_HEALTH` (qits-2351): the last settled health check, read when its Details open: when it
 * ran, whether it passed, why not, and each check's name, verdict and detail. The OpenAPI document
 * types the body `unknown`, so `targetHealthOf` (`target-health.ts`) reads it; a 204 is none yet.
 */
export const GET_TARGET_HEALTH = [
  'at',
  'ok',
  'detail',
  'checks[].name',
  'checks[].ok',
  'checks[].detail',
] as const;

/**
 * The sign-in doors (qits-2351: `TARGET_SIGN_IN_START`, `TARGET_SIGN_IN`, `TARGET_SIGN_IN_CODE`,
 * `TARGET_SIGN_IN_CANCEL`): the sign-in by its id, its harness and state, the browser url and the
 * kimi device code while it waits for a person, and why on a terminal state.
 */
export const TARGET_SIGN_IN = [
  'signInId',
  'harness',
  'state',
  'url',
  'userCode',
  'detail',
] as const;

/** A sign-in, cut to what the page reads. */
export type TargetSignInState = Consumed<GetTargetSignInResponses[200], typeof TARGET_SIGN_IN>;

/** The writes whose answer the page does not read (it reads the list again): the status only. */
export const STATUS_ONLY = [] as const;
