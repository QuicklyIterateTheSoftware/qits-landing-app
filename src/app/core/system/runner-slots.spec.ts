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
    });
  });
});
