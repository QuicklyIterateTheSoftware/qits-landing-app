import { qitsOperation } from '@qits/angular';
import {
  cancelTargetSignIn,
  createTarget,
  deleteTarget,
  getTargetHealth,
  getTargetInstallScript,
  getTargetSignIn,
  greenlightTarget,
  listTargets,
  patchTarget,
  requestTargetHealthCheck,
  requestTargetLoginCheck,
  rotateTargetRegistrationToken,
  startTargetSignIn,
  submitTargetSignInCode,
} from '../../api/system';
import {
  GET_TARGET_HEALTH,
  LIST_TARGET_ROWS,
  LIST_TARGETS,
  STATUS_ONLY,
  TARGET_REFUSAL,
  TARGET_REGISTRATION,
  TARGET_SIGN_IN,
} from './targets.consumes';

/**
 * qits-system's execution targets (epic qits-112) declared as operations (qits-2145), read by the
 * lightning menu's runners and slots line (`app-runner-slots`) through its own `qitsResource`
 * (qits-2146; `TargetsStore` read them before); `targets.operations.pact.spec.ts` binds it.
 */
export const TARGET_LIST = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listTargets',
  method: 'GET',
  call: listTargets,
  consumes: LIST_TARGETS,
});

/*
 * The System section's Targets page (qits-2351, `SystemTargetsPage`) reads and writes the targets
 * through the operations below; `targets.operations.pact.spec.ts` binds each with the same
 * provider, operationId and `consumes`. Reading needs a read role (an agent may); the writes need
 * qits:admin, qits:admin-agent, qits:desk-admin, qits:desk or qits:system, the sign-in doors
 * qits:admin, qits:admin-agent or qits:desk-admin, and a login check qits:admin,
 * qits:admin-agent, qits:desk-admin or qits:desk. Every write reads its refusal's `code` and
 * `message` (`TARGET_REFUSAL`), which `target-refusals.ts` says in the page's words.
 */

/** `TARGET_ROWS`: every target, by name, each as its card shows it. */
export const TARGET_ROWS = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'listTargets',
  method: 'GET',
  call: listTargets,
  consumes: LIST_TARGET_ROWS,
});

/** `TARGET_CREATE`: declares a target; 201 with its one-time install line, 409 TARGET_NAME_TAKEN. */
export const TARGET_CREATE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'createTarget',
  method: 'POST',
  call: createTarget,
  consumes: TARGET_REGISTRATION,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_INSTALL_SCRIPT`: the install script the install line pipes into `sh`, as text. */
export const TARGET_INSTALL_SCRIPT = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getTargetInstallScript',
  method: 'GET',
  call: getTargetInstallScript,
  consumes: STATUS_ONLY,
});

/**
 * `TARGET_PATCH`: a target's description and reservations; 409 RESERVATIONS_EXCEED_TOTAL or
 * MAXIMUM_BELOW_RESERVATION. The page reads the list again after it.
 */
export const TARGET_PATCH = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'patchTarget',
  method: 'PATCH',
  call: patchTarget,
  consumes: STATUS_ONLY,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_DELETE`: 204, or 409 TARGET_BUSY while it holds a lease that has not ended. */
export const TARGET_DELETE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'deleteTarget',
  method: 'DELETE',
  call: deleteTarget,
  consumes: STATUS_ONLY,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_TOKEN_ROTATE`: a new registration token, and the install line carrying it. */
export const TARGET_TOKEN_ROTATE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'rotateTargetRegistrationToken',
  method: 'POST',
  call: rotateTargetRegistrationToken,
  consumes: TARGET_REGISTRATION,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_GREENLIGHT`: lifts a target's quarantine. The page reads the list again after it. */
export const TARGET_GREENLIGHT = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'greenlightTarget',
  method: 'POST',
  call: greenlightTarget,
  consumes: STATUS_ONLY,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_HEALTH`: the last settled health check (200), or none yet (204). */
export const TARGET_HEALTH = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getTargetHealth',
  method: 'GET',
  call: getTargetHealth,
  consumes: GET_TARGET_HEALTH,
});

/**
 * `TARGET_HEALTH_CHECK`: asks the runner for a health check (202); 409 TARGET_UNAVAILABLE while it
 * is not connected. Its result publishes no event: the page reads the list again after it, and
 * Refresh later.
 */
export const TARGET_HEALTH_CHECK = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'requestTargetHealthCheck',
  method: 'POST',
  call: requestTargetHealthCheck,
  consumes: STATUS_ONLY,
  errorConsumes: TARGET_REFUSAL,
});

/**
 * `TARGET_LOGIN_CHECK`: asks the runner to check each harness's sign-in (202); 409
 * TARGET_UNAVAILABLE. Its answer arrives as `TargetLoginChanged`, which reads the list again.
 */
export const TARGET_LOGIN_CHECK = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'requestTargetLoginCheck',
  method: 'POST',
  call: requestTargetLoginCheck,
  consumes: STATUS_ONLY,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_SIGN_IN_START`: starts a harness's sign-in (202 STARTING); 409 SIGN_IN_RUNNING. */
export const TARGET_SIGN_IN_START = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'startTargetSignIn',
  method: 'POST',
  call: startTargetSignIn,
  consumes: TARGET_SIGN_IN,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_SIGN_IN_READ`: one sign-in, followed while it has not settled; 404 SIGN_IN_NOT_FOUND. */
export const TARGET_SIGN_IN_READ = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'getTargetSignIn',
  method: 'GET',
  call: getTargetSignIn,
  consumes: TARGET_SIGN_IN,
});

/** `TARGET_SIGN_IN_CODE`: relays the browser's code (202); 409 SIGN_IN_NOT_AWAITING_CODE. */
export const TARGET_SIGN_IN_CODE = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'submitTargetSignInCode',
  method: 'POST',
  call: submitTargetSignInCode,
  consumes: TARGET_SIGN_IN,
  errorConsumes: TARGET_REFUSAL,
});

/** `TARGET_SIGN_IN_CANCEL`: ends a sign-in (202 CANCELLED, or as it settled). */
export const TARGET_SIGN_IN_CANCEL = qitsOperation({
  provider: 'qits-system-service',
  operationId: 'cancelTargetSignIn',
  method: 'DELETE',
  call: cancelTargetSignIn,
  consumes: TARGET_SIGN_IN,
  errorConsumes: TARGET_REFUSAL,
});
