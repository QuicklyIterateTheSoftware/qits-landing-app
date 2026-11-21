import { QitsApiError, QitsOfflineError } from '@qits/angular';
import { explainTargetRefusal, targetRefusalOf, targetRefusalText } from './target-refusals';

const OPERATION = {
  provider: 'qits-system-service',
  operationId: 'deleteTarget',
  method: 'DELETE',
} as const;

/** A refusal as qits-system answers it, the body of `a declared target`'s 409 recordings. */
const refused = (status: number, body?: unknown) => new QitsApiError(status, body, OPERATION);

describe('targetRefusalOf (qits-2351)', () => {
  it('reads the status, code and message of an error answer', () => {
    expect(
      targetRefusalOf(
        refused(409, { code: 'TARGET_UNAVAILABLE', message: 'Target lab is not connected' }),
      ),
    ).toEqual({ status: 409, code: 'TARGET_UNAVAILABLE', message: 'Target lab is not connected' });
  });

  it('keeps no field the body does not carry as text', () => {
    expect(targetRefusalOf(refused(403, null))).toEqual({
      status: 403,
      code: undefined,
      message: undefined,
    });
    expect(targetRefusalOf(refused(500, { code: 7, message: ' ' }))).toEqual({
      status: 500,
      code: undefined,
      message: undefined,
    });
  });

  it('says an offline write was never sent, and anything else had no answer', () => {
    expect(targetRefusalOf(new QitsOfflineError('offline'))).toEqual({ status: 0, offline: true });
    expect(targetRefusalOf(new Error('network'))).toEqual({ status: 0 });
  });
});

describe('explainTargetRefusal (qits-2351)', () => {
  it.each([
    ['TARGET_NAME_TAKEN', 'A target with this name exists.'],
    ['RESERVATIONS_EXCEED_TOTAL', 'The reservations add up to more slots than the target has.'],
    ['MAXIMUM_BELOW_RESERVATION', 'A slot type’s maximum is below its reservation.'],
    ['TARGET_BUSY', 'This target still holds a lease that has not ended.'],
    ['TARGET_UNAVAILABLE', 'The target’s runner is not connected.'],
    ['SIGN_IN_RUNNING', 'A sign-in for this harness is already running.'],
    ['SIGN_IN_NOT_AWAITING_CODE', 'The sign-in is not waiting for a code any more.'],
    ['SIGN_IN_NOT_FOUND', 'This sign-in is gone: start again.'],
  ])('says %s in its own sentence', (code, sentence) => {
    expect(explainTargetRefusal({ status: 409, code, message: 'raw' }, 'do it')).toBe(sentence);
  });

  it('says a 403 needs an admin role', () => {
    expect(explainTargetRefusal({ status: 403 }, 'delete the target')).toBe(
      'This needs an admin role.',
    );
  });

  it('says a 503 is commissioning being unavailable, in the service’s words when given', () => {
    expect(explainTargetRefusal({ status: 503 }, 'declare the target')).toBe(
      'Commissioning targets is unavailable right now.',
    );
    expect(
      explainTargetRefusal({ status: 503, message: 'RUNNER_PLANE_UNCONFIGURED' }, 'declare'),
    ).toBe('Commissioning targets is unavailable right now — RUNNER_PLANE_UNCONFIGURED.');
  });

  it('says anything else generically, with the status and the message', () => {
    expect(explainTargetRefusal({ status: 400, message: 'slots outside 0..1024' }, 'rotate')).toBe(
      'Could not rotate — 400 slots outside 0..1024.',
    );
    expect(explainTargetRefusal({ status: 500, code: 'OTHER' }, 'save')).toBe(
      'Could not save — 500.',
    );
    expect(explainTargetRefusal({ status: 0 }, 'save')).toBe(
      'Could not save — the service is unreachable.',
    );
    expect(explainTargetRefusal({ status: 0, offline: true }, 'save')).toBe(
      'Could not save — this browser is offline; nothing was sent.',
    );
  });

  it('reads and says a failed run at once', () => {
    expect(targetRefusalText(refused(409, { code: 'TARGET_BUSY' }), 'delete the target')).toBe(
      'This target still holds a lease that has not ended.',
    );
  });
});
