import { QitsApiError, QitsOfflineError } from '@qits/angular';

/**
 * Why a target write was refused (qits-2351): the HTTP status (0: no answer), and qits-system's
 * `code` and `message` when its `ErrorBody` carried them (`TARGET_REFUSAL`).
 */
export interface TargetRefusal {
  readonly status: number;
  readonly code?: string;
  readonly message?: string;
  /** The browser was offline: the write was never sent. */
  readonly offline?: boolean;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/**
 * The refusal a target mutation's failed run threw: a `QitsApiError` carries the status and the
 * error body its `errorConsumes` narrowed (checked here, not trusted: the OpenAPI document types it
 * `unknown`); a `QitsOfflineError` was never sent; anything else (a network failure) is no answer.
 */
export function targetRefusalOf(error: unknown): TargetRefusal {
  if (error instanceof QitsOfflineError) return { status: 0, offline: true };
  if (!(error instanceof QitsApiError)) return { status: 0 };
  const body =
    error.error !== null && typeof error.error === 'object'
      ? (error.error as Record<string, unknown>)
      : {};
  return { status: error.status ?? 0, code: text(body['code']), message: text(body['message']) };
}

/** What each of qits-system's target refusal codes means, in the page's words. */
const CODES: Readonly<Record<string, string>> = {
  TARGET_NAME_TAKEN: 'A target with this name exists.',
  RESERVATIONS_EXCEED_TOTAL: 'The reservations add up to more slots than the target has.',
  MAXIMUM_BELOW_RESERVATION: 'A slot type’s maximum is below its reservation.',
  TARGET_BUSY: 'This target still holds a lease that has not ended.',
  TARGET_UNAVAILABLE: 'The target’s runner is not connected.',
  SIGN_IN_RUNNING: 'A sign-in for this harness is already running.',
  SIGN_IN_NOT_AWAITING_CODE: 'The sign-in is not waiting for a code any more.',
  SIGN_IN_NOT_FOUND: 'This sign-in is gone: start again.',
};

/**
 * A refusal, said for a person (qits-2351), `doing` naming the write ("declare the target"):
 *
 * - a code qits-system names (`TARGET_NAME_TAKEN`, `RESERVATIONS_EXCEED_TOTAL`,
 *   `MAXIMUM_BELOW_RESERVATION`, `TARGET_BUSY`, `TARGET_UNAVAILABLE`, `SIGN_IN_RUNNING`,
 *   `SIGN_IN_NOT_AWAITING_CODE`, `SIGN_IN_NOT_FOUND`): its own sentence;
 * - 403: the write needs an admin role, which is no error;
 * - 503: commissioning is unavailable right now (switched off, or the runner plane unconfigured),
 *   in the service's words when it sent some;
 * - offline: nothing was sent;
 * - anything else: `Could not <doing> — <status> <message>.`, or that the service is unreachable.
 */
export function explainTargetRefusal(refusal: TargetRefusal, doing: string): string {
  if (refusal.offline) return `Could not ${doing} — this browser is offline; nothing was sent.`;
  const known = refusal.code ? CODES[refusal.code] : undefined;
  if (known) return known;
  if (refusal.status === 403) return 'This needs an admin role.';
  if (refusal.status === 503) {
    return refusal.message
      ? `Commissioning targets is unavailable right now — ${refusal.message}.`
      : 'Commissioning targets is unavailable right now.';
  }
  if (refusal.status === 0) return `Could not ${doing} — the service is unreachable.`;
  const said = refusal.message ? `${refusal.status} ${refusal.message}` : `${refusal.status}`;
  return `Could not ${doing} — ${said}.`;
}

/** The two at once: the failed run's refusal, said for a person. */
export function targetRefusalText(error: unknown, doing: string): string {
  return explainTargetRefusal(targetRefusalOf(error), doing);
}
