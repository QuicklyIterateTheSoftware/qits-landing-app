import { harnessLabel, isTerminal, runningSignInId, signInSentence, TERMINAL } from './sign-in';

describe('target sign-in states (qits-2351)', () => {
  it('names the four terminal states', () => {
    expect([...TERMINAL].sort()).toEqual(['CANCELLED', 'EXPIRED', 'FAILED', 'SUCCEEDED']);
  });

  it.each([
    ['SUCCEEDED', true],
    ['FAILED', true],
    ['EXPIRED', true],
    ['CANCELLED', true],
    ['STARTING', false],
    ['AWAITING_BROWSER', false],
    ['AWAITING_CODE', false],
    [undefined, false],
    [null, false],
  ])('reads %j as terminal: %s', (state, terminal) => {
    expect(isTerminal(state)).toBe(terminal);
  });

  it('names a harness for a button', () => {
    expect(harnessLabel('claude')).toBe('Claude');
    expect(harnessLabel('kimi')).toBe('Kimi');
  });

  it('finds the running sign-in a SIGN_IN_RUNNING message names', () => {
    expect(
      runningSignInId(
        'A claude sign-in is running on target lab: 00000000-0000-4000-8000-000000000003',
      ),
    ).toBe('00000000-0000-4000-8000-000000000003');
    expect(runningSignInId('A sign-in is running')).toBeUndefined();
    expect(runningSignInId(undefined)).toBeUndefined();
  });

  it('says each state in a sentence, with why on a terminal one', () => {
    expect(signInSentence('AWAITING_CODE')).toBe(
      'Open the link, sign in, and paste the code the browser shows.',
    );
    expect(signInSentence('SUCCEEDED')).toBe('Signed in.');
    expect(signInSentence('FAILED', 'the CLI exited 1')).toBe(
      'The sign-in failed. the CLI exited 1.',
    );
    expect(signInSentence('CANCELLED')).toBe('The sign-in was cancelled.');
    expect(signInSentence('NEW_STATE')).toBe('The sign-in is NEW_STATE.');
  });
});
