import { systemGoldenMaster } from '../../../testing/golden-masters';
import type { TargetEntry } from './targets.consumes';
import { runnerSlots, type RunnerSlots } from './runner-slots';

describe('runnerSlots', () => {
  const recorded = systemGoldenMaster<TargetEntry[]>('a declared target', 'listTargets');
  const [lab] = recorded;

  /** Connected targets made from the recorded one, with the slots each test needs. */
  const connected = (
    ...slots: {
      slotsTotal: number;
      used: Record<string, number>;
      minimums: Record<string, number>;
    }[]
  ) => slots.map((s) => ({ ...lab, connected: true, ...s })) as TargetEntry[];

  /** The right column as `label used/capacity`. */
  const column = (line: RunnerSlots) =>
    [...line.types, line.shared].map((row) => `${row.label} ${row.used}/${row.capacity}`);

  /** The right column's sums: every slot in use is in one row, every slot is in one capacity. */
  const sums = (line: RunnerSlots) => {
    const rows = [...line.types, line.shared];
    return {
      used: rows.reduce((all, row) => all + row.used, 0),
      capacity: rows.reduce((all, row) => all + row.capacity, 0),
    };
  };

  it('counts nothing for a target that is not connected, but still lists its slot types', () => {
    expect(recorded.every((target) => !target.connected)).toBe(true);
    const line = runnerSlots(recorded);
    expect([line.runners, line.used, line.total]).toEqual([0, 0, 0]);
    expect(column(line)).toEqual(['ci 0/0', 'workspaces 0/0', 'desk 0/0', 'shared 0/0']);
  });

  it("gives each type its reservation as capacity, and the rest to shared (the owner's example)", () => {
    const line = runnerSlots(
      connected(
        { slotsTotal: 8, used: {}, minimums: { ci: 4, workspace: 2, desk: 2 } },
        { slotsTotal: 2, used: {}, minimums: {} },
      ),
    );
    expect(column(line)).toEqual(['ci 0/4', 'workspaces 0/2', 'desk 0/2', 'shared 0/2']);
    expect(line.total).toBe(10);
  });

  it('counts use beyond a reservation in shared, per target (workstation and ws-proof on ci)', () => {
    // The live estate on 2026-10-27, cut to ci: workstation ci 5 of 6, ws-proof ci 3 of 2.
    const line = runnerSlots(
      connected(
        { slotsTotal: 6, used: { ci: 5 }, minimums: { ci: 6 } },
        { slotsTotal: 8, used: { ci: 3 }, minimums: { ci: 2 } },
      ),
    );
    // ci: min(5, 6) + min(3, 2) = 7 of 6 + 2. ws-proof's third ci slot is shared: 1 of 0 + 6.
    expect(column(line)).toEqual(['ci 7/8', 'shared 1/6']);
  });

  it('adds the rows up to slots used and slots total, and names a new type raw', () => {
    const line = runnerSlots(
      connected(
        {
          slotsTotal: 8,
          used: { ci: 4, workspace: 5, desk: 0 },
          minimums: { ci: 2, workspace: 2, desk: 1 },
        },
        {
          slotsTotal: 8,
          used: { ci: 0, workspace: 1, gpu: 1 },
          minimums: { ci: 6, desk: 1, gpu: 1 },
        },
      ),
    );
    expect(line.runners).toBe(2);
    expect(column(line)).toEqual([
      'ci 2/8',
      'workspaces 2/2',
      'desk 0/2',
      'gpu 1/1',
      // First: 3 free, ci takes 2 and workspaces 3 beyond theirs. Second: none free, workspaces 1.
      'shared 6/3',
    ]);
    expect(sums(line)).toEqual({ used: line.used, capacity: line.total });
    expect([line.used, line.total]).toEqual([11, 16]);
  });

  it("floors a target's shared pool at 0 when its minimums reserve more than it has", () => {
    const line = runnerSlots(
      connected(
        { slotsTotal: 2, used: { ci: 1 }, minimums: { ci: 3, desk: 1 } },
        { slotsTotal: 4, used: { ci: 0 }, minimums: { ci: 1 } },
      ),
    );
    // First: 2 − 4 is floored to 0, not −2. Second: 4 − 1 = 3.
    expect(line.shared).toMatchObject({ used: 0, capacity: 3 });
    // Over-reserved, so the capacities (4 + 1 + 3) exceed slots total (6).
    expect(sums(line).capacity).toBe(8);
  });
});
