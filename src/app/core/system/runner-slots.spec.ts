import { runnerSlots, type RunnerSlots } from './runner-slots';
import type { Target } from './targets.store';

describe('runnerSlots', () => {
  /** A connected target with these slots. */
  const target = (
    slotsTotal: number,
    used: Record<string, number>,
    reserved: Record<string, number>,
    connected = true,
  ): Target => ({ connected, slotsTotal, used, reserved });

  /** The right column as `label used/reserved`, then `shared used/unreserved`. */
  const column = (line: RunnerSlots) => [
    ...line.types.map((row) => `${row.label} ${row.used}/${row.reserved}`),
    `shared ${line.shared.used}/${line.shared.unreserved}`,
  ];

  it('counts nothing for a target that is not connected, but still lists its slot types', () => {
    const line = runnerSlots([target(6, { ci: 1 }, { ci: 2, workspace: 2, desk: 1 }, false)]);
    expect([line.runners, line.used, line.total]).toEqual([0, 0, 0]);
    expect(column(line)).toEqual(['ci 0/0', 'workspaces 0/0', 'desk 0/0', 'shared 0/0']);
  });

  it("shows each type's reservation and leaves the rest to shared (the owner's example)", () => {
    const line = runnerSlots([target(8, {}, { ci: 4, workspace: 2, desk: 2 }), target(2, {}, {})]);
    expect(column(line)).toEqual(['ci 0/4', 'workspaces 0/2', 'desk 0/2', 'shared 0/2']);
    expect(line.total).toBe(10);
  });

  it('does not cap use at the reservation, and counts the overflow in shared per target', () => {
    // The live estate on 2026-10-27, cut to ci: workstation ci 5 of 6, ws-proof ci 3 of 2.
    const line = runnerSlots([target(6, { ci: 5 }, { ci: 6 }), target(8, { ci: 3 }, { ci: 2 })]);
    // ci: 5 + 3 used of 6 + 2 reserved. Summed, nothing overflows; per target, ws-proof's third ci
    // slot is shared: 1 used of (6 − 6) + (8 − 2) = 6.
    expect(column(line)).toEqual(['ci 8/8', 'shared 1/6']);
    expect([line.used, line.total]).toEqual([8, 14]);
  });

  it('shows a type above its reservation as it is, and names a new type raw', () => {
    const line = runnerSlots([
      target(4, { ci: 3, gpu: 1 }, { ci: 1, gpu: 1 }),
      target(2, { ci: 0 }, { ci: 1 }, false),
    ]);
    expect(line.runners).toBe(1);
    expect(column(line)).toEqual(['ci 3/1', 'gpu 1/1', 'shared 2/2']);
  });

  it("floors a target's shared pool at 0 when it reserves more than it has", () => {
    const line = runnerSlots([
      target(2, { ci: 1 }, { ci: 3, desk: 1 }),
      target(4, { ci: 0 }, { ci: 1 }),
    ]);
    // First: 2 − 4 is floored to 0, not −2. Second: 4 − 1 = 3.
    expect(line.shared).toEqual({ used: 0, unreserved: 3 });
  });
});
