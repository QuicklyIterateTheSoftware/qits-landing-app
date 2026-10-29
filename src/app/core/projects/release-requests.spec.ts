import { goldenMaster } from '../../../testing/golden-masters';
import type { ReleaseRequestEntry } from './projects.consumes';
import {
  findReleaseRequest,
  freezeChip,
  freezeCount,
  freezeFact,
  queuedBehind,
  queuedNext,
  gateTone,
  latestReleaseRequest,
  nobodyWatching,
  participantsOf,
  releaseRequestName,
  releaseRequestRef,
  requestBadge,
  requestItems,
  requestTitle,
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

  it('finds a request by its uuid or its logical id, and names and links it by its logical id', () => {
    const requests = recorded();
    const first = requests[0];
    expect(findReleaseRequest(requests, first.id!)).toBe(first);
    expect(findReleaseRequest(requests, first.qualifiedId!)).toBe(first);
    expect(findReleaseRequest(requests, 'no-such-request')).toBeUndefined();
    expect(releaseRequestName(requests, first.id!)).toBe(first.qualifiedId);
    expect(releaseRequestRef(first)).toBe(first.qualifiedId);
  });

  it('falls back to the uuid where a request has no logical id', () => {
    const id = '00000000-0000-4000-8000-000000000009';
    const requests: ReleaseRequestEntry[] = [{ id }];
    expect(releaseRequestName(requests, id)).toBe('00000000');
    expect(releaseRequestRef(requests[0])).toBe(id);
    expect(releaseRequestName([], 'other-rr-1')).toBe('other-rr-1');
  });
});

describe('the soft feature freeze (epic qits-1580)', () => {
  /** Recorded: rr-2, queued behind rr-1 (1 of 3 counted), then rr-1, frozen at 3 of 3. */
  const recorded = (): readonly ReleaseRequestEntry[] =>
    goldenMaster(
      'a frozen release request with a queued next request',
      'listProjectReleaseRequests',
    ).requests;

  it('chips a frozen request with its count, and nothing else', () => {
    const [queued, frozen] = recorded();
    expect(freezeChip(frozen)).toEqual({ label: 'frozen 3/3', tone: 'waiting' });
    expect(freezeChip(queued)).toBeNull();
    // Derived: the frozen request once released; its freeze no longer holds anything back.
    expect(freezeChip({ ...frozen, state: 'RELEASED' })).toBeNull();
    // Derived: an older qits-projects, which answers no freeze.
    expect(freezeChip({ ...frozen, featureFreeze: undefined })).toBeNull();
  });

  it('counts an active request quietly, but not a frozen, queued, empty or switched-off one', () => {
    const [queued, frozen] = recorded();
    expect(freezeCount(frozen)).toBeNull();
    expect(freezeCount(queued)).toBeNull();
    // Derived from the queued request: the same request once nothing is ahead of it.
    const active = { ...queued, queuedBehind: undefined, queuedBehindQualifiedId: undefined };
    expect(freezeCount(active)).toBe('1/3');
    expect(
      freezeCount({ ...active, featureFreeze: { ...active.featureFreeze, features: 0 } }),
    ).toBeNull();
    expect(
      freezeCount({ ...active, featureFreeze: { ...active.featureFreeze, threshold: 0 } }),
    ).toBeNull();
    expect(freezeCount({ ...active, state: 'FINALIZED' })).toBeNull();
  });

  it('names the requests either side of the queue by logical id, else by uuid', () => {
    const [queued, frozen] = recorded();
    expect(queuedBehind(queued)).toBe(frozen.qualifiedId);
    expect(queuedNext(frozen)).toBe(queued.qualifiedId);
    expect(queuedBehind(frozen)).toBeNull();
    expect(queuedNext(queued)).toBeNull();
    // Derived: an answer without the logical id falls back to the uuid.
    expect(queuedBehind({ ...queued, queuedBehindQualifiedId: undefined })).toBe(frozen.id);
  });

  it('says the freeze in force: count, frozen, and the level that set the threshold', () => {
    const [queued, frozen] = recorded();
    expect(freezeFact(frozen)).toBe('3 of 3 counted branches · frozen · threshold from platform');
    expect(freezeFact(queued)).toBe('1 of 3 counted branches · threshold from platform');
    // Derived: a repository that switched the freeze off (threshold 0).
    expect(
      freezeFact({
        ...frozen,
        featureFreeze: { features: 3, threshold: 0, frozen: false, source: 'REPOSITORY' },
      }),
    ).toBe('off (repository)');
    expect(
      freezeFact({ ...frozen, featureFreeze: { ...frozen.featureFreeze, source: 'PROJECT' } }),
    ).toBe('3 of 3 counted branches · frozen · threshold from project');
    expect(freezeFact({ ...frozen, featureFreeze: undefined })).toBeNull();
  });
});

describe('what a request carries and who asked (qits-1673)', () => {
  const items = [
    {
      source: 'ticket/qits-1673',
      label: 'ticket/qits-1673',
      workItem: { qualifiedId: 'qits-1673', title: 'Show items and participants' },
    },
    { source: 'fix/rounding', label: 'fix/rounding', workItem: null },
    { source: 'feature/export' },
  ];

  it('names each item by its work item and title, else its label, else its branch', () => {
    expect(requestItems({ items }).map(({ qualifiedId, text }) => ({ qualifiedId, text }))).toEqual(
      [
        { qualifiedId: 'qits-1673', text: 'Show items and participants' },
        { qualifiedId: null, text: 'fix/rounding' },
        { qualifiedId: null, text: 'feature/export' },
      ],
    );
    expect(requestTitle({ items })).toBe(
      'qits-1673 Show items and participants, fix/rounding, feature/export',
    );
  });

  it('names the source branches where the answer has no items', () => {
    const sources = [{ name: 'main' }, { name: 'bump/contract-service' }];
    expect(requestItems({ sources }).map((item) => item.text)).toEqual([
      'main',
      'bump/contract-service',
    ]);
    expect(requestItems({ items: [], sources }).map((item) => item.text)).toEqual([
      'main',
      'bump/contract-service',
    ]);
    expect(requestTitle({})).toBe('');
  });

  it('joins the participants, or says nobody', () => {
    expect(participantsOf({ participants: ['agent@qits', 'dev'] })).toBe('agent@qits, dev');
    expect(participantsOf({ participants: [] })).toBe('–');
    expect(participantsOf({}, '—')).toBe('—');
  });
});
