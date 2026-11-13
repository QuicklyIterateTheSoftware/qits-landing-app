import { QitsApiError, type QitsMutation } from '@qits/angular';
import type { ReleaseRequest } from './release-request.consumes';

/**
 * The requests of the changes a person makes on a release request (qits-2146), built here for the
 * patterns that send them through `qitsMutation` and for `release-request.operations.pact.spec.ts`
 * alike, as `ReleaseRequestStore` built them; and what a change came to.
 */

/** The request a change addresses: its repository and uuid. */
interface Address {
  readonly repoId: string;
  readonly requestId: string;
}

/** A trimmed note, or none when it is blank. */
const noted = (note: string | undefined) => {
  const trimmed = note?.trim();
  return trimmed ? { note: trimmed } : {};
};

/** Approve or Decline: the fold the reader saw travels with the decision; a blank note sends none. */
export const decisionParams = (address: Address, mergedSha: string, note?: string) => ({
  path: address,
  body: { mergedSha, ...noted(note) },
});

/** Withdraw: a blank reason leaves the service to name the caller. */
export const withdrawParams = (address: Address, reason?: string) => {
  const trimmed = reason?.trim();
  return { path: address, body: trimmed ? { reason: trimmed } : {} };
};

/** Override one upstream (epic qits-897): a blank note sends none. */
export const overrideParams = (address: Address, upstreamRequestId: string, note?: string) => ({
  path: address,
  body: { upstreamRequestId, ...noted(note) },
});

/** Run a pipeline phase again. */
export const rerunPhaseParams = (address: Address, phase: string) => ({
  path: { ...address, phase },
});

/** Set a source branch's priority. */
export const priorityParams = (address: Address, branch: string, priority: string) => ({
  path: address,
  body: { branch, priority },
});

/** Move a source to the next request (qits-1665); the reason is required, trimmed. */
export const moveParams = (address: Address, branch: string, reason: string) => ({
  path: address,
  body: { branch, reason: reason.trim() },
});

/** Waive the automations gate for the fold. */
export const waiveParams = (address: Address, foldSha: string, reason: string) => ({
  path: address,
  body: { foldSha, reason },
});

/** Dispatch a run of one automation. */
export const rerunAutomationParams = (address: Address, kind: string) => ({
  path: { ...address, kind },
});

/** The address of `request`, `''` for what it does not name. */
export function addressOf(request: Pick<ReleaseRequest, 'repoId' | 'id'>): Address {
  return { repoId: request.repoId ?? '', requestId: request.id ?? '' };
}

/** Why a change was refused: the HTTP status (0: no answer) and the service's message, if any. */
export interface Refused {
  readonly status: number;
  readonly message?: string;
}

/**
 * What a change answered: the request as it is now, or why it was refused — the HTTP status
 * (0: no answer) and the service's message, when it sent one.
 */
export type ChangeOutcome =
  | { readonly request: ReleaseRequest; readonly status?: undefined; readonly message?: undefined }
  | ({ readonly request?: undefined } & Refused);

/**
 * What a source move answered (qits-1665): both requests as they are now, `from` (the one the
 * branch left) and `to` (the one queued after it), or why it was refused, as {@link ChangeOutcome}.
 */
export type MoveOutcome =
  | {
      readonly from: ReleaseRequest;
      readonly to: ReleaseRequest;
      readonly status?: undefined;
      readonly message?: undefined;
    }
  | ({ readonly from?: undefined; readonly to?: undefined } & Refused);

/** The service's `message` on a refusal, if it sent one; the OpenAPI document gives it no body. */
export function messageOf(error: unknown): string | undefined {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

/** The refusal a mutation's failed run threw: a `QitsApiError`'s status and message, else none. */
export function refusedBy(error: unknown): Refused {
  return error instanceof QitsApiError
    ? { status: error.status ?? 0, message: messageOf(error.error) }
    : { status: 0 };
}

/**
 * Runs a change that answers the request and says what it came to: the request, or the refusal.
 * An answer without a request is no answer.
 */
export async function changeOutcome<Params>(
  mutation: QitsMutation<Params, { readonly request?: ReleaseRequest } | undefined>,
  params: Params,
): Promise<ChangeOutcome> {
  try {
    const request = (await mutation.run(params))?.request;
    return request ? { request } : { status: 0 };
  } catch (error) {
    return refusedBy(error);
  }
}

/** Runs a source move and says what it came to: both requests, or the refusal. */
export async function moveOutcome<Params>(
  mutation: QitsMutation<
    Params,
    { readonly from?: ReleaseRequest; readonly to?: ReleaseRequest } | undefined
  >,
  params: Params,
): Promise<MoveOutcome> {
  try {
    const answer = await mutation.run(params);
    return answer?.from && answer.to ? { from: answer.from, to: answer.to } : { status: 0 };
  } catch (error) {
    return refusedBy(error);
  }
}

/**
 * Runs a change that answers no body (a re-run of an automation, 202) and says what it came to:
 * the status the service answered with, 202 when it took it, or the refusal.
 */
export async function acceptedOutcome<Params>(
  mutation: QitsMutation<Params, unknown>,
  params: Params,
): Promise<Refused> {
  try {
    await mutation.run(params);
    return { status: 202 };
  } catch (error) {
    return refusedBy(error);
  }
}
