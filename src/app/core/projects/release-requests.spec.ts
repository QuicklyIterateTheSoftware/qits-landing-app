import { goldenMaster } from '../../../testing/golden-masters';
import type { ReleaseRequestEntry } from './projects.consumes';
import {
  gateTone,
  latestReleaseRequest,
  nobodyWatching,
  requestBadge,
  requestTone,
  shortSha,
  utcMinute,
} from './release-requests';

/** The recorded requests: PENDING, RELEASED, READY, REJECTED, CONFLICTED, FINALIZED. */
const recorded = (): readonly ReleaseRequestEntry[] =>
  goldenMaster('a project with pending release requests', 'listProjectReleaseRequests').requests;

describe('release requests', () => {
  it('colours gates and requests by how they stand', () => {
    expect(['PASSED', 'PENDING', 'FAILED', 'UNKNOWN'].map(gateTone)).toEqual([
      'ok',
      'waiting',
      'failed',
      'neutral',
    ]);
    expect(
      ['READY', 'RELEASED', 'FINALIZED', 'PENDING', 'CONFLICTED', 'REJECTED', 'WITHDRAWN'].map(
        requestTone,
      ),
    ).toEqual(['ok', 'ok', 'ok', 'waiting', 'failed', 'failed', 'neutral']);
  });

  it('names a request by its state, or as awaiting approval while a person must approve', () => {
    const [pending] = recorded();
    expect(requestBadge(pending)).toEqual({ label: 'pending', tone: 'waiting' });
    // Derived from the recorded PENDING request: the same request with an approval outstanding.
    const asked = { ...pending, approvalRequired: true, approvalState: 'REQUESTED' };
    expect(requestBadge(asked)).toEqual({ label: 'awaiting approval', tone: 'waiting' });
    expect(requestBadge({ ...asked, approvalState: 'APPROVED' }).label).toBe('pending');
  });

  it('says nobody is watching a stopped request a machine asked for', () => {
    const rejected = recorded().find((r) => r.state === 'REJECTED')!;
    expect(nobodyWatching(rejected)).toBe(false);
    // Derived: the recorded REJECTED request, asked for by a machine.
    expect(nobodyWatching({ ...rejected, unattended: true })).toBe(true);
    expect(nobodyWatching({ ...recorded()[0], unattended: true })).toBe(false);
  });

  it('takes the request changed last as the newest, the first one on a tie', () => {
    const requests = recorded();
    // Recorded: every request changed at the same instant, so the first one wins.
    expect(latestReleaseRequest(requests)).toBe(requests[0]);
    // Derived: the FINALIZED one, listed last, changed later than all the others.
    const later = requests.map((r) =>
      r.state === 'FINALIZED' ? { ...r, updatedAt: '2026-01-02T00:00:00Z' } : r,
    );
    expect(latestReleaseRequest(later)?.state).toBe('FINALIZED');
    expect(latestReleaseRequest([])).toBeUndefined();
  });

  it('writes instants in UTC to the minute and shas to seven characters', () => {
    expect(utcMinute('2026-01-01T00:00:00Z')).toBe('2026-01-01 00:00 UTC');
    expect(utcMinute(undefined)).toBe('');
    expect(utcMinute('not a date')).toBe('');
    expect(shortSha('0000000000000000000000000000000000000004')).toBe('0000000');
    expect(shortSha(null)).toBe('');
  });
});
