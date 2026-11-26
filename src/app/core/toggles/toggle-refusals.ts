import { QitsApiError, QitsOfflineError } from '@qits/angular';

/**
 * Why a rules save was refused (qits-2704): the status (0: no answer), qits-toggles' `error` and,
 * for a 400, the `position` of the rule at fault.
 */
export interface ToggleRefusal {
  readonly status: number;
  readonly error?: string;
  readonly position?: number;
  /** The browser was offline: nothing was sent. */
  readonly offline?: boolean;
}

/**
 * The refusal a save's failed run threw: a `QitsApiError` carries the status and the body its
 * `errorConsumes` narrowed (checked here, not trusted); a `QitsOfflineError` was never sent;
 * anything else is no answer.
 */
export function toggleRefusalOf(failure: unknown): ToggleRefusal {
  if (failure instanceof QitsOfflineError) return { status: 0, offline: true };
  if (!(failure instanceof QitsApiError)) return { status: 0 };
  const body =
    failure.error !== null && typeof failure.error === 'object'
      ? (failure.error as Record<string, unknown>)
      : {};
  const error =
    typeof body['error'] === 'string' && body['error'].trim() ? body['error'] : undefined;
  const position =
    typeof body['position'] === 'number' && Number.isInteger(body['position'])
      ? body['position']
      : undefined;
  return { status: failure.status ?? 0, error, position };
}

/**
 * A refusal, said for a person:
 *
 * - 409: someone else changed the rules since they were read;
 * - 403: changing rules needs qits:admin or the delivery desk;
 * - 400: the service's own words (shown beside the rule at `position` when it names one);
 * - offline: nothing was sent;
 * - anything else: the status, or that the service is unreachable.
 */
export function explainToggleRefusal(refusal: ToggleRefusal): string {
  if (refusal.offline) return 'This browser is offline; nothing was sent.';
  if (refusal.status === 409) {
    return 'Someone else changed these rules since you opened them. Reload to see theirs.';
  }
  if (refusal.status === 403) {
    return 'Changing rules needs qits:admin or the delivery desk.';
  }
  if (refusal.status === 400) return refusal.error ?? 'The rules were refused.';
  if (refusal.status === 0) return 'Could not save the rules — the service is unreachable.';
  const said = refusal.error ? `${refusal.status} ${refusal.error}` : `${refusal.status}`;
  return `Could not save the rules — ${said}.`;
}
