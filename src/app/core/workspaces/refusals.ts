import { QitsApiError, type QitsMutation } from '@qits/angular';

/**
 * Why a write was refused: the HTTP status (0: no answer), and the service's `message` and `code`
 * when its body carried them.
 */
export interface Refusal {
  readonly status: number;
  readonly message?: string;
  readonly code?: string;
}

/** What a write came to: its answer, or its refusal. */
export type ActionOutcome<T> =
  { readonly ok: true; readonly value: T } | ({ readonly ok: false } & Refusal);

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/**
 * A refusal read off a failed answer. The error's type is the OpenAPI document's (`ApiError` on a
 * 409, nothing on most others), so its fields are checked here rather than trusted.
 */
export function refusalOf(error: unknown, response: { readonly status: number } | undefined) {
  const body =
    error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return {
    ok: false,
    status: response?.status ?? 0,
    message: text(body['message']),
    code: text(body['code']),
  } as const;
}

/** How a refusal reads in a sentence: `409 <the service's message>`, or what is known. */
export function describeRefusal(refusal: Refusal): string {
  if (refusal.status === 0) return 'the service is unreachable';
  return refusal.message ? `${refusal.status} ${refusal.message}` : `${refusal.status}`;
}

/** `text` ending in a full stop: one added unless it already ends a sentence. */
export function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The refusal a mutation's failed run threw (qits-2146): a `QitsApiError` carries the status and
 * the error body its operation's `errorConsumes` narrowed; anything else (a network failure) is no
 * answer.
 */
export function runRefusal(error: unknown): ReturnType<typeof refusalOf> {
  return error instanceof QitsApiError
    ? refusalOf(error.error, error.status === undefined ? undefined : { status: error.status })
    : refusalOf(undefined, undefined);
}

/**
 * Runs a write through `mutation` (qits-2146) and says what it came to, as the agent and workspace
 * pages' verbs say it: the answer, or the refusal (`runRefusal`). An answer without a body is no
 * answer, as the stores' writes read it.
 */
export async function outcomeOf<Params, Value>(
  mutation: QitsMutation<Params, Value>,
  params: Params,
): Promise<ActionOutcome<Value>> {
  try {
    const value = await mutation.run(params);
    return value === undefined ? refusalOf(undefined, undefined) : { ok: true, value };
  } catch (error) {
    return runRefusal(error);
  }
}
