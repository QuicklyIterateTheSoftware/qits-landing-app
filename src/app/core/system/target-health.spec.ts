import { targetHealthOf } from './target-health';

describe('targetHealthOf (qits-2351)', () => {
  it('reads a settled health check, as `a declared target` records it', () => {
    expect(
      targetHealthOf({
        at: '2026-01-01T00:00:00Z',
        ok: true,
        checks: [
          { ok: true, data: {}, name: 'docker', detail: null },
          { ok: false, data: {}, name: 'login', detail: 'kimi is ABSENT' },
        ],
        detail: '',
        requestId: null,
      }),
    ).toEqual({
      at: '2026-01-01T00:00:00Z',
      ok: true,
      detail: undefined,
      checks: [
        { name: 'docker', ok: true, detail: undefined },
        { name: 'login', ok: false, detail: 'kimi is ABSENT' },
      ],
    });
  });

  it('reads no health check from a 204 or a body that is no object', () => {
    expect(targetHealthOf(undefined)).toBeUndefined();
    expect(targetHealthOf(null)).toBeUndefined();
    expect(targetHealthOf('ok')).toBeUndefined();
  });

  it('reads a check missing its fields as failed and unnamed', () => {
    expect(targetHealthOf({ checks: [{}, 3] })?.checks).toEqual([
      { name: '—', ok: false, detail: undefined },
    ]);
  });
});
