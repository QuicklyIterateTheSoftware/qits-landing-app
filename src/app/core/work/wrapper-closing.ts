import type { WrapperClosing } from './work.consumes';

/**
 * A VERIFIED ticket's closing line, in words (qits-1873): the text before the request, the
 * request's qualified id (linked to its page; absent when the line names none) and the text after
 * it. `warning` when the ticket cannot close by itself (UNPROVEN).
 */
export interface ClosingLine {
  readonly before: string;
  readonly request?: string;
  readonly after: string;
  readonly warning: boolean;
}

/** The line while the closings are not loaded, failed, or do not name the ticket (qits-150). */
export const CLOSES_ONCE_RELEASED: ClosingLine = {
  before: 'Closes once its release lands',
  after: '',
  warning: false,
};

/**
 * An IN_FLIGHT request's state in words. Plain `string` keys: the generated client gives the state
 * no closed union, and a word not here is shown lowercased.
 */
const STATE_WORDS: Readonly<Record<string, string>> = {
  PENDING: 'pending',
  READY: 'ready',
  RELEASED: 'released',
  REJECTED: 'rejected',
  CONFLICTED: 'conflicted',
  FAILED: 'failed',
};

/** How the request of an IN_FLIGHT row stands: its approval while it waits on one, else its state. */
export function requestStandingOf(closing: WrapperClosing): string {
  if (closing.approval === 'WAITING') return 'waiting on approval';
  const state = closing.requestState ?? '';
  return STATE_WORDS[state] ?? state.toLowerCase();
}

/**
 * What a VERIFIED ticket's line says, from its row of `listWrapperClosings` (qits-1873), or
 * {@link CLOSES_ONCE_RELEASED} without one:
 *
 * - IN_FLIGHT: "Closes with <request>, <state>" ({@link requestStandingOf});
 * - CLOSING at the ledger's LIVE: "Closes now: <request> finalized"; any other CLOSING row is the
 *   empty wrapper's withdrawal: "Closes now: nothing left to release";
 * - NO_REQUEST: "Waits for its wrapper release request";
 * - UNPROVEN, a warning: "Its wrapper request <request> ended without proof, so it cannot close by
 *   itself".
 *
 * A row naming a verdict this app does not know, or IN_FLIGHT without a request, keeps the
 * generic line.
 */
export function closingLineOf(closing: WrapperClosing | undefined): ClosingLine {
  const request = closing?.requestQualifiedId ?? undefined;
  switch (closing?.verdict) {
    case 'IN_FLIGHT':
      return request
        ? {
            before: 'Closes with ',
            request,
            after: `, ${requestStandingOf(closing)}`,
            warning: false,
          }
        : CLOSES_ONCE_RELEASED;
    case 'CLOSING':
      return closing.step === 'LIVE' && request
        ? { before: 'Closes now: ', request, after: ' finalized', warning: false }
        : { before: 'Closes now: nothing left to release', after: '', warning: false };
    case 'NO_REQUEST':
      return { before: 'Waits for its wrapper release request', after: '', warning: false };
    case 'UNPROVEN':
      return {
        before: request ? 'Its wrapper request ' : 'Its wrapper request',
        request,
        after: ' ended without proof, so it cannot close by itself',
        warning: true,
      };
    default:
      return CLOSES_ONCE_RELEASED;
  }
}
