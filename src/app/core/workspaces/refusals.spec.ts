import { QitsApiError } from '@qits/angular';
import { workspacesGoldenMaster } from '../../../testing/golden-masters';
import { describeRefusal, outcomeOf, refusalOf, runRefusal } from './refusals';

const LEFTOVER = 'an agent with leftover work';
const DISCARD = {
  provider: 'qits-workspaces-service',
  operationId: 'discardAgent',
  method: 'POST',
} as const;

describe('refusalOf and describeRefusal', () => {
  it('read the service’s message and code, and nothing that is not a string', () => {
    const body = workspacesGoldenMaster(LEFTOVER, 'discardAgent');
    expect(refusalOf(body, { status: 409 })).toEqual({
      ok: false,
      status: 409,
      message: body.message,
      code: 'AGENT_HAS_LEFTOVER_WORK',
    });
    expect(refusalOf({ message: 3 }, undefined)).toEqual({
      ok: false,
      status: 0,
      message: undefined,
      code: undefined,
    });
  });

  it('say what is known: the status and message, a bare status, or no answer', () => {
    expect(describeRefusal({ status: 409, message: 'Busy.' })).toBe('409 Busy.');
    expect(describeRefusal({ status: 500 })).toBe('500');
    expect(describeRefusal({ status: 0 })).toBe('the service is unreachable');
  });
});

describe('runRefusal and outcomeOf', () => {
  it('read a refused run’s status and body, and anything else as no answer', () => {
    const body = workspacesGoldenMaster(LEFTOVER, 'discardAgent');
    expect(runRefusal(new QitsApiError(409, body, DISCARD))).toEqual({
      ok: false,
      status: 409,
      message: body.message,
      code: 'AGENT_HAS_LEFTOVER_WORK',
    });
    expect(runRefusal(new TypeError('Failed to fetch')).status).toBe(0);
  });

  it('say what a mutation’s run came to', async () => {
    const answered = { run: () => Promise.resolve({ state: 'REMOVED' }) };
    const refused = {
      run: () => Promise.reject(new QitsApiError(409, { code: 'AGENT_BUSY' }, DISCARD)),
    };
    const empty = { run: () => Promise.resolve(undefined) };
    const mutation = (fake: object) => fake as Parameters<typeof outcomeOf<unknown, unknown>>[0];
    expect(await outcomeOf(mutation(answered), {})).toEqual({
      ok: true,
      value: { state: 'REMOVED' },
    });
    expect(await outcomeOf(mutation(refused), {})).toMatchObject({
      ok: false,
      status: 409,
      code: 'AGENT_BUSY',
    });
    expect(await outcomeOf(mutation(empty), {})).toMatchObject({ ok: false, status: 0 });
  });
});
