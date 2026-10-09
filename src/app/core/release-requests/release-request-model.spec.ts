import type { ReleaseRequest, ReleaseSource } from './release-request.consumes';
import {
  approvalOutstanding,
  awaitingApproval,
  canPrioritiseSource,
  describeRefusal,
  formatInstant,
  formatRelativeTime,
  hasReleased,
  isChangeable,
  isSettled,
  priorityBadge,
  priorityOptions,
  refName,
  RELEASE_PRIORITIES,
  releaseConflict,
  releaseDetail,
  releaseSources,
  shortShaOrNone,
  sourceTitle,
} from './release-request-model';

// Pure rules, so hand-built requests (ported from qits-projects-frontend's model spec).

function source(overrides: Partial<ReleaseSource> = {}): ReleaseSource {
  return { kind: 'BRANCH', name: 'main', ref: 'refs/heads/main', implicit: false, ...overrides };
}

const TAG = source({
  kind: 'RELEASED_TAG',
  name: '2026.903.1',
  ref: 'refs/tags/2026.903.1',
  implicit: true,
});

function request(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    id: 'r1',
    repoId: 'repo-1',
    repoName: 'qits-ci',
    backingBranch: 'release/r1',
    sources: [source(), source({ name: 'adhoc-changes', ref: 'refs/heads/adhoc-changes' })],
    mergedSha: '20c377ee71fabe6f32429d1506989efecec7798b',
    state: 'PENDING',
    summary: 'A change worth releasing',
    requester: 'someone',
    retryable: false,
    createdAt: '2026-09-01T13:34:59.888123Z',
    updatedAt: '2026-09-01T13:34:59.888123Z',
    ...overrides,
  };
}

const ALL_STATES = [
  'PENDING',
  'READY',
  'RELEASED',
  'FINALIZED',
  'REJECTED',
  'CONFLICTED',
  'FAILED',
  'WITHDRAWN',
  'OBSOLETE',
];

describe('release request model', () => {
  describe('the approval gate', () => {
    it('is not on a request the service says nothing about', () => {
      expect(approvalOutstanding(request())).toBe(false);
    });

    it('is not on a repository whose releases need no person', () => {
      expect(approvalOutstanding(request({ approvalRequired: false }))).toBe(false);
    });

    it('is outstanding while the fold is unjudged, and answered once it is', () => {
      expect(
        approvalOutstanding(request({ approvalRequired: true, approvalState: 'REQUESTED' })),
      ).toBe(true);
      expect(
        approvalOutstanding(request({ approvalRequired: true, approvalState: 'APPROVED' })),
      ).toBe(false);
      expect(
        approvalOutstanding(request({ approvalRequired: true, approvalState: 'DECLINED' })),
      ).toBe(false);
    });

    it('reads an unknown word, and a missing one, as still waiting', () => {
      expect(approvalOutstanding(request({ approvalRequired: true, approvalState: 'MAYBE' }))).toBe(
        true,
      );
      expect(approvalOutstanding(request({ approvalRequired: true }))).toBe(true);
    });

    it('awaits approval only while the request is pending', () => {
      const asked = { approvalRequired: true, approvalState: 'REQUESTED' };
      expect(awaitingApproval(request(asked))).toBe(true);
      expect(awaitingApproval(request({ ...asked, state: 'READY' }))).toBe(false);
      expect(awaitingApproval(request({ ...asked, state: 'FAILED' }))).toBe(false);
    });
  });

  describe('isSettled', () => {
    it('counts the states that have stopped moving, a conflict and a rejection among them', () => {
      for (const state of ['FINALIZED', 'REJECTED', 'CONFLICTED', 'WITHDRAWN', 'OBSOLETE']) {
        expect(isSettled(request({ state }))).toBe(true);
      }
    });

    it('watches the states the gates and the worker are still working on, released included', () => {
      for (const state of ['PENDING', 'READY', 'RELEASED']) {
        expect(isSettled(request({ state }))).toBe(false);
      }
    });

    it('splits FAILED on retryable, because the sweep is still trying one of them', () => {
      expect(isSettled(request({ state: 'FAILED', retryable: true }))).toBe(false);
      expect(isSettled(request({ state: 'FAILED', retryable: false }))).toBe(true);
    });

    it('treats an unknown state as still moving', () => {
      expect(isSettled(request({ state: 'RECONCILING' }))).toBe(false);
    });
  });

  describe('hasReleased', () => {
    it('is true from the tag being cut on', () => {
      expect(hasReleased(request({ state: 'RELEASED' }))).toBe(true);
      expect(hasReleased(request({ state: 'FINALIZED' }))).toBe(true);
    });

    it('is false everywhere there is no tag', () => {
      for (const state of ALL_STATES.filter((s) => s !== 'RELEASED' && s !== 'FINALIZED')) {
        expect(hasReleased(request({ state }))).toBe(false);
      }
    });
  });

  describe('isChangeable', () => {
    it('is everything the service does not refuse with 409: the open states minus released', () => {
      expect(ALL_STATES.filter((state) => isChangeable(request({ state })))).toEqual([
        'PENDING',
        'READY',
        'REJECTED',
        'CONFLICTED',
        'FAILED',
      ]);
    });
  });

  describe('priorities', () => {
    it('are the six the service stores, weakest first', () => {
      expect(RELEASE_PRIORITIES).toEqual(['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHER', 'BLOCKING']);
    });

    it('leave the default and everything under it uncoloured', () => {
      for (const word of ['LOWEST', 'LOW', 'MEDIUM']) {
        expect(priorityBadge(word)).toEqual({ label: word.toLowerCase(), tone: 'neutral' });
      }
    });

    it('warn above the default and shout at the top of it', () => {
      expect(priorityBadge('HIGH')?.tone).toBe('waiting');
      expect(priorityBadge('HIGHER')?.tone).toBe('waiting');
      expect(priorityBadge('BLOCKING')?.tone).toBe('failed');
    });

    it('draw nothing where there is no priority', () => {
      expect(priorityBadge(undefined)).toBeNull();
      expect(priorityBadge(null)).toBeNull();
      expect(priorityBadge('  ')).toBeNull();
    });

    it('draw a word this build has never heard of as itself, uncoloured', () => {
      expect(priorityBadge('URGENT')).toEqual({ label: 'urgent', tone: 'neutral' });
    });

    it('offer the six in the service’s order, plus a stored word this build does not know', () => {
      expect(priorityOptions('HIGH')).toEqual(RELEASE_PRIORITIES);
      expect(priorityOptions(undefined)).toEqual(RELEASE_PRIORITIES);
      expect(priorityOptions('URGENT')).toEqual([...RELEASE_PRIORITIES, 'URGENT']);
    });

    it('are set on the named branches, never on the tags the service added', () => {
      expect(canPrioritiseSource(source())).toBe(true);
      expect(canPrioritiseSource(TAG)).toBe(false);
    });
  });

  describe('releaseDetail', () => {
    it('is the sentence when there is one, and nothing when there is not', () => {
      expect(releaseDetail(request({ detail: 'The build failed.' }))).toBe('The build failed.');
      expect(releaseDetail(request({ detail: '  ' }))).toBeNull();
      expect(releaseDetail(request())).toBeNull();
    });
  });

  describe('releaseSources', () => {
    it('puts the branches somebody named before the tags the service added', () => {
      const sources = releaseSources(
        request({
          sources: [TAG, source({ name: 'adhoc-changes', ref: 'refs/heads/adhoc-changes' })],
        }),
      );
      expect(sources.map((entry) => entry.name)).toEqual(['adhoc-changes', '2026.903.1']);
    });

    it('keeps the service’s order within each kind', () => {
      const sources = releaseSources(
        request({ sources: [source(), source({ name: 'b', ref: 'refs/heads/b' }), TAG] }),
      );
      expect(sources.map((entry) => entry.name)).toEqual(['main', 'b', '2026.903.1']);
    });

    it('is empty for a request answered without the field', () => {
      expect(releaseSources(request({ sources: undefined }))).toEqual([]);
    });

    it('says on the implicit ones why they are there, and states the ref on all of them', () => {
      expect(sourceTitle(source())).toBe('refs/heads/main');
      expect(sourceTitle(TAG)).toContain('refs/tags/2026.903.1');
      expect(sourceTitle(TAG)).toContain('has not reached main yet');
    });
  });

  describe('refName', () => {
    it('strips the two prefixes git spells and leaves anything else whole', () => {
      expect(refName('refs/heads/feature/x')).toBe('feature/x');
      expect(refName('refs/tags/2026.903.1')).toBe('2026.903.1');
      expect(refName('refs/remotes/origin/main')).toBe('refs/remotes/origin/main');
      expect(refName('main')).toBe('main');
    });
  });

  describe('releaseConflict', () => {
    const conflict = {
      target: 'release/r1',
      conflicts: [
        {
          path: 'pom.xml',
          head: 'refs/tags/2026.903.1',
          headSha: '9f1c2b3d4e5f60718293a4b5c6d7e8f901234567',
          reason: 'content',
        },
      ],
    };

    it('is the conflict when the read carries one, whatever the state is called', () => {
      expect(releaseConflict(request({ state: 'CONFLICTED', conflict }))).toBe(conflict);
      expect(releaseConflict(request({ state: 'RECONCILING', conflict }))).toBe(conflict);
    });

    it('is nothing when there is none, or one with no paths in it', () => {
      expect(releaseConflict(request())).toBeNull();
      expect(releaseConflict(request({ conflict: { ...conflict, conflicts: [] } }))).toBeNull();
    });
  });

  describe('formatting', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');

    it('says how long ago, in the largest whole unit, and the date after a month', () => {
      expect(formatRelativeTime('2026-10-09T11:59:30Z', now)).toBe('just now');
      expect(formatRelativeTime('2026-10-09T11:55:00Z', now)).toBe('5m ago');
      expect(formatRelativeTime('2026-10-09T09:00:00Z', now)).toBe('3h ago');
      expect(formatRelativeTime('2026-10-07T12:00:00Z', now)).toBe('2d ago');
      expect(formatRelativeTime('2026-08-01T12:00:00Z', now)).toBe('1 Aug 2026');
      expect(formatRelativeTime(undefined, now)).toBe('—');
    });

    it('gives the exact instant in UTC', () => {
      expect(formatInstant('2026-10-09T14:05:09.123Z')).toBe('9 Oct 2026 14:05:09Z');
      expect(formatInstant('not a date')).toBe('—');
    });

    it('abbreviates a sha, and says — for none', () => {
      expect(shortShaOrNone('20c377ee71fabe6f32429d1506989efecec7798b')).toBe('20c377e');
      expect(shortShaOrNone(undefined)).toBe('—');
    });

    it('names a refusal by its status and the service’s message', () => {
      expect(describeRefusal(409, 'already released')).toBe('409 already released');
      expect(describeRefusal(500, undefined)).toBe('500');
      expect(describeRefusal(0, undefined)).toBe('the service is unreachable');
    });
  });
});
