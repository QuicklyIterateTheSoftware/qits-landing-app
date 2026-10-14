import {
  checkLineOf,
  connectivityOf,
  dataEntriesOf,
  healthAtOf,
  healthBadgeOf,
  isUpdating,
  memoryLimitProblemOf,
  memoryOf,
  nameProblemOf,
  presenceOf,
  quarantineReasonOf,
  slotsProblemOf,
  swapLimitProblemOf,
  swapOf,
} from './runner-labels';

describe('runner labels', () => {
  it('judge a runner’s name and slots as the service does', () => {
    expect(nameProblemOf('')).toBe('A name is required.');
    expect(nameProblemOf('build-box-1')).toBe('');
    expect(nameProblemOf('1box')).toContain('starting with a letter');
    expect(slotsProblemOf(0)).toBe('');
    expect(slotsProblemOf(-1)).toBe('Slots must be 0 or more.');
    expect(slotsProblemOf(NaN)).toBe('Slots must be 0 or more.');
  });

  it('judge the memory caps: docker sizes, swap covering memory, -1 unlimited', () => {
    expect(memoryLimitProblemOf('')).toBe('');
    expect(memoryLimitProblemOf('8g')).toBe('');
    expect(memoryLimitProblemOf('8 gigs')).toContain('A docker size');
    expect(swapLimitProblemOf('', '')).toBe('');
    expect(swapLimitProblemOf('', '8g')).toContain('Needs a workspace memory limit too');
    expect(swapLimitProblemOf('8g', '-1')).toBe('');
    expect(swapLimitProblemOf('8g', '8192m')).toBe('');
    expect(swapLimitProblemOf('8g', '4g')).toContain('Must be at least');
    expect(swapLimitProblemOf('8g', 'lots')).toContain('or -1 for unlimited swap');
  });

  it('say how a runner is connected', () => {
    expect(connectivityOf({ connected: true, registered: true })).toEqual({
      label: 'connected',
      tone: 'ok',
    });
    expect(connectivityOf({ connected: false, registered: true }).label).toBe('offline');
    expect(connectivityOf({ connected: false, registered: false }).label).toBe('never connected');
  });

  it('say a login’s presence', () => {
    expect(presenceOf('PRESENT').label).toBe('logged in');
    expect(presenceOf('ABSENT').label).toBe('not logged in');
    expect(presenceOf('UNKNOWN').label).toBe('unknown');
    expect(presenceOf(null).label).toBe('not reported');
  });

  it('say whether a runner rolls over, why it is quarantined, and its caps', () => {
    expect(isUpdating({ connected: true, version: 'a', pinnedVersion: 'b' })).toBe(true);
    expect(isUpdating({ connected: false, version: 'a', pinnedVersion: 'b' })).toBe(false);
    expect(isUpdating({ connected: true, version: 'b', pinnedVersion: 'b' })).toBe(false);
    expect(quarantineReasonOf({ quarantineReason: undefined })).toBe(
      'awaiting its first health check',
    );
    expect(quarantineReasonOf({ quarantineReason: 'docker failed' })).toBe('docker failed');
    expect(memoryOf({ workspaceMemoryLimit: undefined })).toBe('platform default memory');
    expect(memoryOf({ workspaceMemoryLimit: '8g' })).toBe('8g memory');
    expect(swapOf({ workspaceMemorySwapLimit: undefined })).toBeNull();
    expect(swapOf({ workspaceMemorySwapLimit: '-1' })).toBe('-1 swap');
  });

  it('read the last health check from `health`, else the older fields', () => {
    const at = '2026-01-01T00:00:00Z';
    expect(healthBadgeOf({ health: { ok: false, at }, lastHealthCheckOk: true })?.label).toBe(
      'health check failed',
    );
    expect(healthBadgeOf({ health: undefined, lastHealthCheckOk: true })?.label).toBe(
      'health check passed',
    );
    expect(healthBadgeOf({ health: undefined, lastHealthCheckOk: undefined })).toBeNull();
    expect(healthAtOf({ health: { at }, lastHealthCheckAt: undefined })).toBe(at);
    expect(healthAtOf({ health: undefined, lastHealthCheckAt: undefined })).toBeNull();
    expect(checkLineOf({ name: 'docker', ok: false, detail: 'gone' })).toEqual({
      name: 'docker',
      badge: { label: 'failed', tone: 'failed' },
      detail: 'gone',
    });
  });

  it('flatten a check’s data into entries', () => {
    expect(dataEntriesOf(undefined)).toEqual([]);
    expect(dataEntriesOf({})).toEqual([]);
    expect(dataEntriesOf('x')).toEqual([['value', 'x']]);
    expect(dataEntriesOf({ version: '27.1', disks: [1, 2], ok: true })).toEqual([
      ['version', '27.1'],
      ['disks', '[1,2]'],
      ['ok', 'true'],
    ]);
  });
});
