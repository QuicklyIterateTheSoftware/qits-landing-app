import {
  draftOf,
  loginCommandOf,
  loginOf,
  loginTone,
  memoryLine,
  optionalSlots,
  slotCount,
  slotLines,
  slotsInUse,
  targetPatch,
} from './target-rows';

/** The slots of `a connected target with leases`' recorded target. */
const LAB = {
  slotsTotal: 6,
  reservations: { ci: 2, workspace: 2, desk: 1 },
  maximums: { ci: null, workspace: 3, desk: null },
  used: { ci: 1, workspace: 1, desk: 0 },
};

describe('a target’s card lines (qits-2351)', () => {
  it('lists each slot type’s use, reservation and ceiling', () => {
    expect(slotLines(LAB as never)).toEqual([
      { type: 'ci', used: 1, reserved: 2, maximum: '—' },
      { type: 'workspace', used: 1, reserved: 2, maximum: '3' },
      { type: 'desk', used: 0, reserved: 1, maximum: '—' },
    ]);
    expect(slotLines({} as never).map((line) => line.used)).toEqual([0, 0, 0]);
  });

  it('counts the slots in use against the total', () => {
    expect(slotsInUse(LAB as never)).toBe('2/6 slots in use');
  });

  it('reads a harness’s sign-in, UNKNOWN when unsaid, and its tone', () => {
    const row = { login: { claude: 'PRESENT', kimi: 'ABSENT' } } as never;
    expect(loginOf(row, 'claude')).toBe('PRESENT');
    expect(loginOf(row, 'other')).toBe('UNKNOWN');
    expect(loginTone('PRESENT')).toBe('ok');
    expect(loginTone('ABSENT')).toBe('failed');
    expect(loginTone('UNKNOWN')).toBe('waiting');
  });

  it('picks each harness’s manual command', () => {
    const row = { loginCommand: 'docker run claude', kimiLoginCommand: null } as never;
    expect(loginCommandOf(row, 'claude')).toBe('docker run claude');
    expect(loginCommandOf(row, 'kimi')).toBeUndefined();
  });

  it('says the node’s memory only when the runner reported some', () => {
    expect(memoryLine({ memory: null } as never)).toBeUndefined();
    expect(
      memoryLine({
        memory: {
          nodeOomKills: null,
          kernelOomKills: null,
          memoryMaxBytes: null,
          reportedAt: null,
        },
      } as never),
    ).toBeUndefined();
    expect(
      memoryLine({
        memory: { nodeOomKills: 1, kernelOomKills: 5, memoryMaxBytes: 8 * 1024 ** 3 },
      } as never),
    ).toBe('1 OOM kill on the node · 5 OOM kills on the host · limit 8.00 GiB');
  });

  it('reads typed slot counts from 0 to 1024', () => {
    expect(slotCount('')).toBe(0);
    expect(slotCount(' 3 ')).toBe(3);
    expect(slotCount('1024')).toBe(1024);
    expect(slotCount('1025')).toBeUndefined();
    expect(slotCount('-1')).toBeUndefined();
    expect(slotCount('2.5')).toBeUndefined();
    expect(optionalSlots('')).toBeUndefined();
    expect(optionalSlots('5')).toBe(5);
    expect(optionalSlots('x')).toBe(false);
  });
});

describe('targetPatch (qits-2351)', () => {
  const row = { description: 'the lab box', reservations: { ci: 2, workspace: 2, desk: 1 } };

  it('opens the draft with what the target has', () => {
    expect(draftOf(row)).toEqual({
      description: 'the lab box',
      reservations: { ci: '2', workspace: '2', desk: '1' },
    });
  });

  it('sends only what changed, as `a declared target`’s recorded patch', () => {
    const draft = draftOf(row);
    expect(
      targetPatch(row, {
        description: 'the lab box, rebuilt',
        reservations: { ...draft.reservations, desk: '0' },
      }),
    ).toEqual({ description: 'the lab box, rebuilt', reservations: { desk: 0 } });
    expect(targetPatch(row, { ...draft, description: '' })).toEqual({ description: '' });
  });

  it('sends nothing when nothing changed, and refuses a count that is no slot count', () => {
    const draft = draftOf(row);
    expect(targetPatch(row, draft)).toBeUndefined();
    expect(targetPatch(row, { ...draft, reservations: { ...draft.reservations, ci: 'x' } })).toBe(
      false,
    );
  });
});
