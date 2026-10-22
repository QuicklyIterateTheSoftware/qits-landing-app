import type { ApprovalRequirement, ReleaseRequest } from './release-request.consumes';
import { approvalLines, approvalOffer, roleName } from './approval-requirements';

// Pure rules, so hand-built requests.

const NOW = Date.parse('2026-01-01T03:00:00Z');

const OPEN: ApprovalRequirement = {
  id: 'manual-review',
  reason: 'The repository asks a person to review every release',
  admits: ['person'],
  excludesAuthors: false,
  satisfied: false,
};

const SATISFIED: ApprovalRequirement = {
  id: 'automation:screenshot-baselines',
  reason: 'Screenshot baselines changed',
  admits: ['agent', 'person'],
  excludesAuthors: false,
  detail: 'src/app/__screenshots__/home.png',
  satisfied: true,
  satisfiedBy: { approver: 'agent-7', roles: ['agent', 'agent@shop'], at: '2026-01-01T00:00:00Z' },
};

/** `null` stands for a wire answer of `null`, which the generated type does not admit. */
function request(approvalRequirements?: ApprovalRequirement[] | null): ReleaseRequest {
  return {
    id: 'r1',
    state: 'PENDING',
    approvalRequired: true,
    approvalState: 'WAITING',
    ...(approvalRequirements !== undefined
      ? { approvalRequirements: approvalRequirements as ApprovalRequirement[] }
      : {}),
  };
}

const loaded = (eligibleRequirementIds?: string[]) =>
  ({ status: 'loaded', value: { eligibleRequirementIds } }) as const;

describe('approval requirements', () => {
  describe('roleName', () => {
    it('reads the three role forms', () => {
      expect(roleName('person')).toBe('a person');
      expect(roleName('agent')).toBe('an agent of this project');
      expect(roleName('agent@shop')).toBe('an agent of shop');
      expect(roleName('auditor')).toBe('auditor');
    });
  });

  describe('approvalLines', () => {
    it('is null for an answer without requirements, so the page draws as before', () => {
      expect(approvalLines(request())).toBeNull();
      expect(approvalLines(request(null))).toBeNull();
    });

    it('is empty for a fold that needs no approval', () => {
      expect(approvalLines(request([]))).toEqual([]);
    });

    it('reads reason, roles, detail and who satisfied it', () => {
      const [open, satisfied] = approvalLines(request([OPEN, SATISFIED]), NOW)!;
      expect(open).toEqual({
        id: 'manual-review',
        reason: OPEN.reason,
        admits: 'a person',
        excludesAuthors: false,
        detail: null,
        satisfied: false,
        satisfiedBy: null,
      });
      expect(satisfied.admits).toBe('an agent of this project or a person');
      expect(satisfied.detail).toBe('src/app/__screenshots__/home.png');
      expect(satisfied.satisfiedBy).toEqual({
        approver: 'agent-7',
        roles: 'agent, agent@shop',
        when: '3h ago',
        at: '1 Jan 2026 00:00:00Z',
      });
    });

    it('tolerates a requirement with every field absent', () => {
      const [line] = approvalLines(request([{}]))!;
      expect(line).toEqual({
        id: 'requirement-0',
        reason: 'An approval is required',
        admits: '',
        excludesAuthors: false,
        detail: null,
        satisfied: false,
        satisfiedBy: null,
      });
    });

    it('lists three roles with commas and "or"', () => {
      const [line] = approvalLines(
        request([{ ...OPEN, admits: ['person', 'agent', 'agent@shop'], excludesAuthors: true }]),
      )!;
      expect(line.admits).toBe('a person, an agent of this project or an agent of shop');
      expect(line.excludesAuthors).toBe(true);
    });
  });

  describe('approvalOffer', () => {
    const BOTH = { approve: true, decline: true, note: null };

    it('offers both as before without requirements or without an eligibility answer', () => {
      expect(approvalOffer(request(), loaded([]))).toEqual(BOTH);
      expect(approvalOffer(request([]), loaded([]))).toEqual(BOTH);
      expect(approvalOffer(request([OPEN]), undefined)).toEqual(BOTH);
      expect(approvalOffer(request([OPEN]), { status: 'error' })).toEqual(BOTH);
    });

    it('offers neither while the eligibility read is on its way', () => {
      expect(approvalOffer(request([OPEN]), { status: 'loading' })).toEqual({
        approve: false,
        decline: false,
        note: null,
      });
    });

    it('offers Approve only for an open requirement the viewer may satisfy', () => {
      expect(approvalOffer(request([OPEN, SATISFIED]), loaded(['manual-review']))).toEqual(BOTH);
      expect(
        approvalOffer(request([OPEN, SATISFIED]), loaded(['automation:screenshot-baselines'])),
      ).toEqual({ approve: false, decline: true, note: null });
    });

    it('offers neither, saying why, when the viewer may satisfy none', () => {
      const offer = approvalOffer(request([OPEN]), loaded([]));
      expect(offer.approve).toBe(false);
      expect(offer.decline).toBe(false);
      expect(offer.note).toContain('none of the roles');
      expect(approvalOffer(request([OPEN]), loaded(undefined)).decline).toBe(false);
      expect(approvalOffer(request([OPEN]), loaded(['another-fold-requirement'])).decline).toBe(
        false,
      );
    });
  });
});
