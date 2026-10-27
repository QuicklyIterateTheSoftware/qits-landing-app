import { systemGoldenMaster } from '../../../testing/golden-masters';
import type { TargetEntry } from './targets.consumes';
import { runnerSlots } from './runner-slots';

describe('runnerSlots', () => {
  const recorded = systemGoldenMaster<TargetEntry[]>('a declared target', 'listTargets');

  it('counts nothing for a target that is not connected, but still lists its slot types', () => {
    expect(recorded.every((target) => !target.connected)).toBe(true);
    expect(runnerSlots(recorded)).toEqual({
      runners: 0,
      used: 0,
      total: 0,
      types: [
        { type: 'ci', label: 'ci', used: 0, reserved: 0 },
        { type: 'workspace', label: 'workspaces', used: 0, reserved: 0 },
        { type: 'desk', label: 'desk', used: 0, reserved: 0 },
      ],
      shared: { used: 0, size: 0 },
    });
  });

  it('sums the connected targets, shows used above the minimum as it is, and names a new type raw', () => {
    // Two copies of the recorded target, connected, with leases on them; one with a new slot type.
    const [lab] = recorded;
    const targets = [
      { ...lab, connected: true, slotsTotal: 8, used: { ci: 4, workspace: 5, desk: 0 } },
      {
        ...lab,
        connected: true,
        slotsTotal: 8,
        used: { ci: 0, workspace: 1, desk: 0, gpu: 1 },
        minimums: { ci: 6, workspace: 0, desk: 1, gpu: 1 },
      },
      { ...lab, connected: false, slotsTotal: 99, used: { ci: 9, workspace: 9, desk: 9 } },
    ] as TargetEntry[];
    expect(runnerSlots(targets)).toEqual({
      runners: 2,
      used: 11,
      total: 16,
      types: [
        { type: 'ci', label: 'ci', used: 4, reserved: 8 },
        { type: 'workspace', label: 'workspaces', used: 6, reserved: 2 },
        { type: 'desk', label: 'desk', used: 0, reserved: 2 },
        { type: 'gpu', label: 'gpu', used: 1, reserved: 1 },
      ],
      // Per target. First: 8 − (2 + 2 + 1) = 3 free; ci 4 − 2 and workspace 5 − 2 overflow, 5.
      // Second: 8 − (6 + 0 + 1 + 1) = 0 free; workspace 1 − 0 overflows, 1.
      shared: { used: 6, size: 3 },
    });
  });

  it("computes the shared pool from the owner's example: ci at, workspaces over, desk under", () => {
    const [lab] = recorded;
    const targets = [
      {
        ...lab,
        connected: true,
        slotsTotal: 16,
        used: { ci: 8, workspace: 4, desk: 0 },
        minimums: { ci: 8, workspace: 2, desk: 1 },
      },
    ] as TargetEntry[];
    const line = runnerSlots(targets);
    expect([line.used, line.total]).toEqual([12, 16]);
    expect(line.types.map((row) => row.used)).toEqual([8, 4, 0]);
    expect(line.shared).toEqual({ used: 2, size: 5 });
  });

  it('counts the shared pool per target, so one under its minimum does not hide one over it', () => {
    // The live estate on 2026-10-27, cut to ci: workstation ci 5 of 6, ws-proof ci 3 of 2.
    const [lab] = recorded;
    const targets = [
      { ...lab, connected: true, slotsTotal: 6, used: { ci: 5 }, minimums: { ci: 6 } },
      { ...lab, connected: true, slotsTotal: 8, used: { ci: 3 }, minimums: { ci: 2 } },
    ] as TargetEntry[];
    const line = runnerSlots(targets);
    expect(line.types).toEqual([{ type: 'ci', label: 'ci', used: 8, reserved: 8 }]);
    // Summed, ci is 8 of 8 and nothing overflows; per target, ws-proof's ci takes 1.
    // Free: workstation 6 − 6 = 0, ws-proof 8 − 2 = 6.
    expect(line.shared).toEqual({ used: 1, size: 6 });
  });

  it("floors a target's pool at 0 when its minimums reserve more than it has", () => {
    const [lab] = recorded;
    const targets = [
      { ...lab, connected: true, slotsTotal: 2, used: { ci: 1 }, minimums: { ci: 3, desk: 1 } },
      { ...lab, connected: true, slotsTotal: 4, used: { ci: 0 }, minimums: { ci: 1 } },
    ] as TargetEntry[];
    // First: 2 − 4 is floored to 0, not −2. Second: 4 − 1 = 3.
    expect(runnerSlots(targets).shared).toEqual({ used: 0, size: 3 });
  });
});
