import { goldenMaster } from '../../../testing/golden-masters';
import type { WrapperClosing } from './work.consumes';
import { CLOSES_ONCE_RELEASED, closingLineOf, requestStandingOf } from './wrapper-closing';

/**
 * The words of a VERIFIED ticket's closing line (qits-1873), from qits-projects' golden master "a
 * project with VERIFIED tickets in every wrapper verdict": one ticket per verdict, and the two
 * CLOSING ways (LIVE, and the empty wrapper's withdrawal).
 */
const STATE = 'a project with VERIFIED tickets in every wrapper verdict';
const closings = (): readonly WrapperClosing[] =>
  goldenMaster<{ closings: WrapperClosing[] }>(STATE, 'listWrapperClosings').closings;
const rowOf = (ticket: string) => closings().find((c) => c.ticket === ticket)!;

/** The line as one string, the request in place. */
const text = (closing: WrapperClosing | undefined) => {
  const line = closingLineOf(closing);
  return `${line.before}${line.request ?? ''}${line.after}`;
};

describe('closingLineOf', () => {
  it.each([
    ['contract-00000001-1', 'Waits for its wrapper release request', false],
    ['contract-00000001-2', 'Closes with contract-00000001-contract-00000001-rr-1, pending', false],
    [
      'contract-00000001-3',
      'Closes now: contract-00000001-contract-00000001-rr-2 finalized',
      false,
    ],
    ['contract-00000001-4', 'Closes now: nothing left to release', false],
    [
      'contract-00000001-5',
      'Its wrapper request contract-00000001-contract-00000001-rr-4 ended without proof, so it cannot close by itself',
      true,
    ],
  ])('says what the recorded row of %s says', (ticket, words, warning) => {
    expect(text(rowOf(ticket))).toBe(words);
    expect(closingLineOf(rowOf(ticket)).warning).toBe(warning);
  });

  it('names the request where the line links it, and none where it does not', () => {
    expect(closingLineOf(rowOf('contract-00000001-1')).request).toBeUndefined();
    expect(closingLineOf(rowOf('contract-00000001-2')).request).toBe(
      'contract-00000001-contract-00000001-rr-1',
    );
    expect(closingLineOf(rowOf('contract-00000001-4')).request).toBeUndefined();
  });

  it('keeps the generic line without a row, or for a verdict it does not know', () => {
    expect(closingLineOf(undefined)).toBe(CLOSES_ONCE_RELEASED);
    // Derived from the recorded IN_FLIGHT row: a verdict a newer service may send.
    const unknown = {
      ...rowOf('contract-00000001-2'),
      verdict: 'LATER',
    } as unknown as WrapperClosing;
    expect(closingLineOf(unknown)).toBe(CLOSES_ONCE_RELEASED);
  });
});

describe('requestStandingOf', () => {
  // Each derived from the recorded IN_FLIGHT row (PENDING, NOT_REQUIRED), its state or approval
  // changed: the golden master records one IN_FLIGHT request only.
  it.each([
    ['PENDING', 'NOT_REQUIRED', 'pending'],
    ['READY', 'NOT_REQUIRED', 'ready'],
    ['RELEASED', 'APPROVED', 'released'],
    ['REJECTED', 'NOT_REQUIRED', 'rejected'],
    ['CONFLICTED', 'NOT_REQUIRED', 'conflicted'],
    ['FAILED', 'NOT_REQUIRED', 'failed'],
    ['PENDING', 'WAITING', 'waiting on approval'],
    ['READY', 'WAITING', 'waiting on approval'],
    ['SOMETHING_NEW', 'NOT_REQUIRED', 'something_new'],
  ])('a %s request, approval %s, is %s', (requestState, approval, words) => {
    const row = { ...rowOf('contract-00000001-2'), requestState, approval };
    expect(requestStandingOf(row)).toBe(words);
  });

  it('puts approval WAITING into the IN_FLIGHT line', () => {
    const row = { ...rowOf('contract-00000001-2'), approval: 'WAITING' };
    expect(text(row)).toBe(
      'Closes with contract-00000001-contract-00000001-rr-1, waiting on approval',
    );
  });
});
