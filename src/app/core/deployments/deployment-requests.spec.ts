import {
  affectsDeploymentRequest,
  affectsDeploymentRequests,
  deploymentOutcome,
  formatDayTime,
  gateLabel,
  gateTone,
  isCompletedRequest,
  isHeldForApproval,
  isDeclined,
  isInFlight,
  isPendingGate,
  isRefused,
  priorityLabel,
  priorityTone,
  movingWord,
  newestActive,
  requestLifecycle,
  statusLabel,
  stoppedWord,
  statusTone,
  type GatedRequest,
  type LifecycleFacts,
  type LifecycleRequest,
  type ShownDeploymentRequests,
} from './deployment-requests';

/** The gate's states as qits-deployments writes them: nulls where a field is unset. */
const PENDING: GatedRequest = { qualityGate: 'UNMET', gateSettledAt: null, gateDetail: null };
const HELD: GatedRequest = { ...PENDING, deployHold: true, gateDetail: 'held for manual approval' };
const REFUSED: GatedRequest = {
  qualityGate: 'UNMET',
  gateSettledAt: '2026-01-01T00:00:00Z',
  gateDetail: 'tests failed',
  deploymentStatus: null,
};
const MET = (deploymentStatus: string | null): GatedRequest => ({
  qualityGate: 'MET',
  gateSettledAt: '2026-01-01T00:00:00Z',
  deploymentStatus,
});

describe('deployment requests', () => {
  it('tells a pending gate from a refusal by whether it settled', () => {
    expect(isPendingGate(PENDING)).toBe(true);
    expect(isRefused(PENDING)).toBe(false);
    expect(isPendingGate(REFUSED)).toBe(false);
    expect(isRefused(REFUSED)).toBe(true);
    expect(isPendingGate(MET('ACTIVE'))).toBe(false);
    expect(isRefused(MET('ACTIVE'))).toBe(false);
    // An absent field reads as unset, as a null does.
    expect(isPendingGate({ qualityGate: 'UNMET' })).toBe(true);
  });

  it('reads a hold from deployHold, else from the gate’s sentence', () => {
    expect(isHeldForApproval(HELD)).toBe(true);
    expect(isHeldForApproval({ ...HELD, deployHold: false })).toBe(false);
    expect(
      isHeldForApproval({ ...PENDING, gateDetail: 'held for manual approval on x-rr-3' }),
    ).toBe(true);
    expect(
      isHeldForApproval({ ...PENDING, deployHold: null, gateDetail: 'held for manual approval' }),
    ).toBe(true);
    expect(isHeldForApproval(PENDING)).toBe(false);
    // A settled request is never held, whatever its flag says.
    expect(isHeldForApproval({ ...REFUSED, deployHold: true })).toBe(false);
  });

  it('counts QUEUED, STARTING and SPEC_UNREADABLE as in flight', () => {
    expect(['QUEUED', 'STARTING', 'SPEC_UNREADABLE'].every(isInFlight)).toBe(true);
    expect(['ACTIVE', 'FAILED', 'DECLARATION_REFUSED', 'ROLLED_BACK'].some(isInFlight)).toBe(false);
  });

  it('splits pending from completed as RequestLifecycle does', () => {
    expect(isCompletedRequest(PENDING)).toBe(false);
    expect(isCompletedRequest(HELD)).toBe(false);
    expect(isCompletedRequest(MET('QUEUED'))).toBe(false);
    expect(isCompletedRequest(MET('SPEC_UNREADABLE'))).toBe(false);
    expect(isCompletedRequest(MET('ACTIVE'))).toBe(true);
    expect(isCompletedRequest(MET('DECLARATION_REFUSED'))).toBe(true);
    expect(isCompletedRequest(MET(null))).toBe(true);
    expect(isCompletedRequest(REFUSED)).toBe(true);
  });

  it('names the gate and gives it its tone', () => {
    expect([gateLabel(HELD), gateTone(HELD)]).toEqual(['Held for approval', 'warning']);
    expect([gateLabel(PENDING), gateTone(PENDING)]).toEqual(['In the gate', 'info']);
    expect([gateLabel(MET('ACTIVE')), gateTone(MET('ACTIVE'))]).toEqual(['Gate met', 'success']);
    expect([gateLabel(REFUSED), gateTone(REFUSED)]).toEqual(['Gate unmet', 'warning']);
  });

  it('says what became of a request with no deployment status', () => {
    expect(deploymentOutcome(PENDING)).toBe('nothing queued yet');
    expect(deploymentOutcome(REFUSED)).toBe('nothing was deployed');
    expect(deploymentOutcome(MET(null))).toBe('no deployment row');
  });

  it('words and tones the priorities, an unknown one raw and neutral, none blank', () => {
    expect(['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHER', 'BLOCKING'].map(priorityLabel)).toEqual([
      'Lowest',
      'Low',
      'Medium',
      'High',
      'Higher',
      'Blocking',
    ]);
    expect(['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHER', 'BLOCKING'].map(priorityTone)).toEqual([
      'neutral',
      'neutral',
      'neutral',
      'info',
      'warning',
      'danger',
    ]);
    expect([priorityLabel('URGENT'), priorityTone('URGENT')]).toEqual(['URGENT', 'neutral']);
    expect([priorityLabel(null), priorityLabel(undefined), priorityLabel('')]).toEqual([
      '',
      '',
      '',
    ]);
  });

  it('words and tones the deployment statuses, an unknown one raw and neutral', () => {
    expect([statusLabel('ACTIVE'), statusTone('ACTIVE')]).toEqual(['Active', 'success']);
    expect([statusLabel('SCALED_TO_ZERO'), statusTone('SCALED_TO_ZERO')]).toEqual([
      'Stopped',
      'warning',
    ]);
    expect([statusLabel('DECLARATION_REFUSED'), statusTone('DECLARATION_REFUSED')]).toEqual([
      'Declaration refused',
      'danger',
    ]);
    expect([statusLabel('PAUSED'), statusTone('PAUSED')]).toEqual(['PAUSED', 'neutral']);
  });

  it('writes the table’s timestamp in UTC, without a year', () => {
    expect(formatDayTime('2026-07-31T14:09:04Z')).toBe('31 Jul 14:09');
    expect(formatDayTime('2026-01-01T00:00:00Z')).toBe('1 Jan 00:00');
    expect(formatDayTime(null)).toBe('—');
    expect(formatDayTime('not a date')).toBe('—');
  });

  describe('affectsDeploymentRequests', () => {
    const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });
    const settled: ShownDeploymentRequests = {
      requests: [{ ...MET('ACTIVE'), id: 'r1', applicationName: 'qits-ci' }],
      repositories: new Set(['qits-ci-service']),
    };
    const pending: ShownDeploymentRequests = {
      ...settled,
      requests: [...settled.requests, { ...HELD, id: 'r2', applicationName: 'qits-idp' }],
    };

    it('counts a deployment of an application on screen, or any while one is pending', () => {
      const ofCi = event('DeploymentActive', { applicationName: 'qits-ci', version: '1' });
      const ofOther = event('DeploymentQueued', { applicationName: 'qits-events', version: '1' });
      expect(affectsDeploymentRequests(ofCi, settled)).toBe(true);
      expect(affectsDeploymentRequests(ofOther, settled)).toBe(false);
      expect(affectsDeploymentRequests(ofOther, pending)).toBe(true);
    });

    it('counts a decline of a request on screen only', () => {
      expect(
        affectsDeploymentRequests(
          event('DeploymentRequestDeclined', { deploymentRequestId: 'r2' }),
          pending,
        ),
      ).toBe(true);
      expect(
        affectsDeploymentRequests(
          event('DeploymentRequestDeclined', { deploymentRequestId: 'x' }),
          pending,
        ),
      ).toBe(false);
    });

    it('counts a release of one of the project’s repositories only', () => {
      const release = (repository: string) =>
        event('SoftwareRelease', { repository, version: '1', packageType: 'docker' });
      expect(affectsDeploymentRequests(release('qits-ci-service'), settled)).toBe(true);
      expect(affectsDeploymentRequests(release('elsewhere-service'), pending)).toBe(false);
    });
  });

  it('tells a declined hold by its declinedAt', () => {
    expect(isDeclined({ declinedAt: '2026-01-01T00:00:00Z' })).toBe(true);
    expect(isDeclined({ declinedAt: null })).toBe(false);
    expect(isDeclined({})).toBe(false);
  });

  it('says what a moving request waits on, and why a finished one stopped', () => {
    expect(movingWord(HELD)).toBe('held for manual approval');
    expect(movingWord(PENDING)).toBe('waiting on the quality gate');
    expect(movingWord(MET('STARTING'))).toBe('deploying');
    expect(stoppedWord(REFUSED)).toBe('the gate refused it');
    expect(stoppedWord(MET('ROLLED_BACK'))).toBe('rolled back to the predecessor');
    expect(stoppedWord(MET('PAUSED'))).toBe('PAUSED');
    expect(stoppedWord(MET(null))).toBe('no deployment was recorded');
  });

  it('finds the newest ACTIVE deployment of the application by its own time', () => {
    const deployments = [
      {
        applicationName: 'qits-ci',
        version: '1',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        applicationName: 'qits-ci',
        version: '3',
        status: 'FAILED',
        createdAt: '2026-01-03T00:00:00Z',
      },
      {
        applicationName: 'qits-ci',
        version: '2',
        status: 'ACTIVE',
        createdAt: '2026-01-02T00:00:00Z',
      },
      {
        applicationName: 'qits-idp',
        version: '9',
        status: 'ACTIVE',
        createdAt: '2026-01-09T00:00:00Z',
      },
    ];
    expect(newestActive(deployments, 'qits-ci')?.version).toBe('2');
    expect(newestActive(deployments, 'qits-events')).toBeUndefined();
  });

  describe('requestLifecycle', () => {
    const request: LifecycleRequest = {
      ...MET('ACTIVE'),
      version: '2026.101.120000',
      applicationName: 'qits-ci',
      environmentId: 'env-1',
      repoId: 'qits-ci-service',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const serving = (version: string) => ({
      status: 'loaded' as const,
      value: [
        {
          applicationName: 'qits-ci',
          version,
          status: 'ACTIVE',
          createdAt: '2026-01-02T00:00:00Z',
        },
      ],
    });
    const facts = (over: Partial<LifecycleFacts> = {}): LifecycleFacts => ({
      request,
      deployments: serving(request.version ?? ''),
      environments: [{ id: 'env-1', name: 'dev' }],
      releaseRequests: { status: 'loaded', value: [] },
      ...over,
    });
    const tile = (over: Partial<LifecycleFacts>, id: string) =>
      requestLifecycle(facts(over)).find((stage) => stage.id === id);

    it('is always released, at the request’s time', () => {
      expect(requestLifecycle(facts())[0]).toEqual({
        id: 'released',
        title: 'Released 2026.101.120000',
        meta: '1 Jan 2026 00:00:00Z',
        state: 'reached',
      });
    });

    it('runs in the tier when its newest ACTIVE deployment is this version', () => {
      expect(tile({}, 'tier')).toEqual({
        id: 'tier',
        title: 'Running in dev',
        meta: 'since 2 Jan 2026 00:00:00Z',
        state: 'reached',
      });
    });

    it('stopped once completed and not serving, saying what serves instead', () => {
      const superseded = { ...request, ...MET('SUPERSEDED') };
      expect(
        tile({ request: superseded, deployments: serving('2026.102.0') }, 'tier'),
      ).toMatchObject({
        meta: 'dev is running 2026.102.0',
        state: 'stopped',
        detail: 'a newer deployment took its place',
      });
      const refused = { ...request, ...REFUSED };
      expect(
        tile({ request: refused, deployments: { status: 'loaded', value: [] } }, 'tier'),
      ).toMatchObject({
        meta: 'nothing is serving dev',
        state: 'stopped',
        detail: 'the gate refused it',
      });
    });

    it('is pending while held, in the gate or deploying, and names the tier by id unread', () => {
      const pending = (over: Partial<LifecycleRequest>) =>
        tile(
          { request: { ...request, ...over }, deployments: serving('0'), environments: [] },
          'tier',
        );
      expect(pending(HELD)).toMatchObject({
        title: 'Running in env-1',
        meta: 'held for manual approval',
        state: 'pending',
      });
      expect(pending(PENDING)?.meta).toBe('waiting on the quality gate');
      expect(pending(MET('STARTING'))?.meta).toBe('deploying');
    });

    it('says no environment was recorded, or that the tier’s read is not there', () => {
      expect(tile({ request: { ...request, environmentId: null } }, 'tier')).toEqual({
        id: 'tier',
        title: 'Running',
        meta: 'no environment recorded',
        state: 'pending',
      });
      expect(tile({ deployments: { status: 'error' } }, 'tier')).toMatchObject({
        meta: 'the tier’s deployments could not be read',
        state: 'pending',
      });
      expect(tile({ deployments: { status: 'loading' } }, 'tier')?.state).toBe('pending');
    });

    it('is merged when the repository’s release request of this version merged', () => {
      const merged = {
        status: 'loaded' as const,
        value: [
          {
            repoName: 'other-service',
            version: request.version,
            mergedToMainAt: '2026-01-05T00:00:00Z',
          },
          {
            repoName: 'qits-ci-service',
            version: request.version,
            mergedToMainAt: '2026-01-03T00:00:00Z',
          },
        ],
      };
      expect(tile({ releaseRequests: merged }, 'merged')).toEqual({
        id: 'merged',
        title: 'Merged to main',
        meta: '3 Jan 2026 00:00:00Z',
        state: 'reached',
      });
      const unmerged = {
        status: 'loaded' as const,
        value: [{ repoName: 'qits-ci-service', version: request.version, mergedToMainAt: null }],
      };
      expect(tile({ releaseRequests: unmerged }, 'merged')?.meta).toBe('not merged yet');
      expect(tile({}, 'merged')?.meta).toBe('no release request carries this version');
    });

    it('keeps the merge tile pending, with why, when it cannot know', () => {
      expect(tile({ releaseRequests: { status: 'error' } }, 'merged')).toMatchObject({
        meta: 'the release requests could not be read',
        state: 'pending',
      });
      expect(tile({ request: { ...request, repoId: null } }, 'merged')).toMatchObject({
        meta: 'this release named no repository',
        state: 'pending',
      });
    });
  });

  describe('affectsDeploymentRequest', () => {
    const event = (name: string, payload: object) => ({ name, payload: JSON.stringify(payload) });
    const shown = { id: 'r1', applicationName: 'qits-ci', repoId: 'qits-ci-service' };

    it('counts a deployment of the request’s application only', () => {
      expect(
        affectsDeploymentRequest(event('DeploymentActive', { applicationName: 'qits-ci' }), shown),
      ).toBe(true);
      expect(
        affectsDeploymentRequest(event('DeploymentQueued', { applicationName: 'qits-idp' }), shown),
      ).toBe(false);
    });

    it('counts a decline of this request only', () => {
      const declined = (id: string) =>
        event('DeploymentRequestDeclined', { deploymentRequestId: id });
      expect(affectsDeploymentRequest(declined('r1'), shown)).toBe(true);
      expect(affectsDeploymentRequest(declined('r2'), shown)).toBe(false);
    });

    it('counts a release of the request’s repository only', () => {
      const release = (repository: string) =>
        event('SoftwareRelease', { repository, version: '1', packageType: 'docker' });
      expect(affectsDeploymentRequest(release('qits-ci-service'), shown)).toBe(true);
      expect(affectsDeploymentRequest(release('qits-idp-service'), shown)).toBe(false);
    });

    it('counts nothing before the request is read', () => {
      expect(
        affectsDeploymentRequest(
          event('DeploymentActive', { applicationName: 'qits-ci' }),
          undefined,
        ),
      ).toBe(false);
    });
  });
});
