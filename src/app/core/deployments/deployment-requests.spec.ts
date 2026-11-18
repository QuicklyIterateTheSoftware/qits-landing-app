import {
  affectsDeploymentRequests,
  deploymentOutcome,
  deploymentRequestHref,
  formatDayTime,
  gateLabel,
  gateTone,
  isCompletedRequest,
  isHeldForApproval,
  isInFlight,
  isPendingGate,
  isRefused,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  type GatedRequest,
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

  it('addresses a request’s page on the deployments frontend, encoded', () => {
    expect(deploymentRequestHref('https://deployments.qits.example', 'qits', 'a/b')).toBe(
      'https://deployments.qits.example/qits/deployment-requests/a%2Fb',
    );
    expect(deploymentRequestHref('', 'qits', 'id')).toBeUndefined();
    expect(deploymentRequestHref('https://deployments.qits.example', 'qits', null)).toBeUndefined();
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
});
