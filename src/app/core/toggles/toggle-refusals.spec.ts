import { QitsApiError, QitsOfflineError } from '@qits/angular';
import { explainToggleRefusal, toggleRefusalOf } from './toggle-refusals';
import { TOGGLE_RULES_SAVE } from './toggles.operations';

describe('toggle refusals', () => {
  it('reads a 400 with its position', () => {
    const refusal = toggleRefusalOf(
      apiError(400, { error: 'the STATIC rule must be the last one', position: 0 }),
    );
    expect(refusal).toEqual({
      status: 400,
      error: 'the STATIC rule must be the last one',
      position: 0,
    });
    expect(explainToggleRefusal(refusal)).toBe('the STATIC rule must be the last one');
  });

  it('says a 409, a 403 and no answer for a person', () => {
    expect(explainToggleRefusal(toggleRefusalOf(apiError(409, { error: 'stale' })))).toBe(
      'Someone else changed these rules since you opened them. Reload to see theirs.',
    );
    expect(explainToggleRefusal(toggleRefusalOf(apiError(403, null)))).toBe(
      'Changing rules needs qits:admin or the delivery desk.',
    );
    expect(explainToggleRefusal(toggleRefusalOf(new Error('down')))).toBe(
      'Could not save the rules — the service is unreachable.',
    );
    expect(explainToggleRefusal(toggleRefusalOf(new QitsOfflineError('offline')))).toBe(
      'This browser is offline; nothing was sent.',
    );
  });

  it('does not trust a body that is not the refusal shape', () => {
    expect(toggleRefusalOf(apiError(400, { error: 7, position: 'x' }))).toEqual({
      status: 400,
      error: undefined,
      position: undefined,
    });
  });
});

function apiError(status: number, body: unknown): QitsApiError {
  return new QitsApiError(status, body ?? undefined, TOGGLE_RULES_SAVE);
}
