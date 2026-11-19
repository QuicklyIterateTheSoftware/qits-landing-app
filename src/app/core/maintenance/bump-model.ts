/**
 * How a bump is said, wherever the app shows one (qits-2332's bump page, qits-2334's repository
 * page): its status as a word and a chip tone, whether it is still under way, and what its
 * `releaseRequestId` is.
 */

/** A bump status's tone, as a chip (`ChipTone`) takes it. */
export type BumpTone = 'ok' | 'waiting' | 'failed' | 'neutral';

/** A bump still under way: read again after `BUMP_EVENTS`. Any other status is settled. */
export function isUnderWay(status: string | null | undefined): boolean {
  return status === 'REQUESTED' || status === 'RUNNING';
}

/** A status's chip tone; SUPERSEDED, NOTHING_TO_DO and any status the page does not know: neutral. */
export function bumpStatusTone(status: string | null | undefined): BumpTone {
  if (status === 'SUCCEEDED') return 'ok';
  if (status === 'FAILED') return 'failed';
  return isUnderWay(status) ? 'waiting' : 'neutral';
}

/** A status as a word: `NOTHING_TO_DO` is "nothing to do", any other its own word, lowercased. */
export function bumpStatusLabel(status: string | null | undefined): string {
  return status ? status.toLowerCase().replaceAll('_', ' ') : 'unknown';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a bump's `releaseRequestId` is: a request to link, a sentinel to explain, or none. */
export type ReleaseRequestRef =
  | { readonly kind: 'request'; readonly id: string }
  | { readonly kind: 'sentinel'; readonly word: string; readonly explanation: string }
  | { readonly kind: 'none' };

/**
 * A bump's release request: a uuid is a request, linked to its page; `converged` and `refused`
 * are sentinels qits-maintenance writes into the same column (the old frontend's
 * `releaseSentinel`), said as words with what they mean; anything else is shown as it is, with no
 * link, and null is none.
 */
export function releaseRequestRef(value: string | null | undefined): ReleaseRequestRef {
  if (!value) return { kind: 'none' };
  if (UUID.test(value)) return { kind: 'request', id: value };
  if (value === 'converged') {
    return {
      kind: 'sentinel',
      word: 'converged',
      explanation: 'there was nothing left to ask for: no request came back',
    };
  }
  if (value === 'refused') {
    return {
      kind: 'sentinel',
      word: 'refused',
      explanation: 'the release request was refused; the message says why',
    };
  }
  return { kind: 'sentinel', word: value, explanation: '' };
}
