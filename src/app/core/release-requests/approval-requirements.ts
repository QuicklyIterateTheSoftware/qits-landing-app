import type { ApprovalEligibility, ReleaseRequest } from './release-request.consumes';
import { formatInstant, formatRelativeTime } from './release-request-model';

/**
 * Pure rules about a request's approval requirements (epic qits-1038): one line per requirement,
 * and which of Approve and Decline the viewer is offered. Nothing here calls a service.
 *
 * A request answered by an older qits-projects carries no `approvalRequirements`, and an older
 * qits-projects has no eligibility door: either way the page draws the approval as it did before
 * (both buttons while a person must answer), and the provider's 403 is the truth.
 */

/** Who satisfied a requirement: the approver, the roles they held, and when. */
export interface SatisfiedBy {
  readonly approver: string;
  /** The roles as a person reads them, `person, agent of qits`; empty when none were named. */
  readonly roles: string;
  /** `3h ago`; empty when the answer named no time. */
  readonly when: string;
  /** The instant to the second, for a tooltip; empty when the answer named no time. */
  readonly at: string;
}

/** One requirement, as its line on the page draws it. */
export interface ApprovalLine {
  readonly id: string;
  readonly reason: string;
  /** The admitted roles as a person reads them: `a person or an agent of this project`. */
  readonly admits: string;
  readonly excludesAuthors: boolean;
  readonly detail: string | null;
  readonly satisfied: boolean;
  readonly satisfiedBy: SatisfiedBy | null;
}

/** One approval role (`person`, `agent`, `agent@<slug>`) as a person reads it. */
export function roleName(role: string): string {
  if (role === 'person') return 'a person';
  if (role === 'agent') return 'an agent of this project';
  const scoped = /^agent@(.+)$/.exec(role);
  return scoped ? `an agent of ${scoped[1]}` : role;
}

/** Roles as a short list, `person, agent@qits`, for "satisfied by … (roles)". */
function rolesList(roles: readonly string[] | null | undefined): string {
  return (roles ?? []).filter((role) => !!role).join(', ');
}

/** `a`, `a or b`, `a, b or c`. */
function either(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

/**
 * The request's requirements as lines, or null when its answer carries none (an older
 * qits-projects): the page then draws the approval as before. An empty list is an answer too: the
 * fold needs no approval.
 */
export function approvalLines(
  request: ReleaseRequest,
  now = Date.now(),
): readonly ApprovalLine[] | null {
  const requirements = request.approvalRequirements;
  if (!Array.isArray(requirements)) return null;
  return requirements.map((requirement, index) => {
    const by = requirement.satisfiedBy;
    const admits: readonly string[] = requirement.admits ?? [];
    const admitted = admits.filter((role) => !!role).map(roleName);
    return {
      id: requirement.id || `requirement-${index}`,
      reason: requirement.reason?.trim() || requirement.id || 'An approval is required',
      admits: either(admitted),
      excludesAuthors: requirement.excludesAuthors === true,
      detail: requirement.detail?.trim() || null,
      satisfied: requirement.satisfied === true,
      satisfiedBy:
        requirement.satisfied === true && by
          ? {
              approver: by.approver?.trim() || 'someone',
              roles: rolesList(by.roles),
              when: by.at ? formatRelativeTime(by.at, now) : '',
              at: by.at ? formatInstant(by.at) : '',
            }
          : null,
    };
  });
}

/**
 * The eligibility read as the page holds it: `undefined` when it was not made (the request carries
 * no requirements), else a read that may still be on its way, may have failed, or answered.
 */
export type EligibilityRead =
  | {
      readonly status: 'loading' | 'loaded' | 'error';
      readonly value?: ApprovalEligibility;
    }
  | undefined;

/** Which decisions the viewer is offered on a request a person must answer. */
export interface ApprovalOffer {
  readonly approve: boolean;
  readonly decline: boolean;
  /**
   * Why neither is offered, for the viewer to read; null when one is, or when the page draws the
   * approval as before.
   */
  readonly note: string | null;
}

const AS_BEFORE: ApprovalOffer = { approve: true, decline: true, note: null };

/**
 * Approve only when the eligibility read names an open (unsatisfied) requirement; Decline only
 * when it names any requirement. Without requirements on the request, or without an eligibility
 * answer (the read failed, as on an older qits-projects), both are offered as before. While the
 * read is on its way, neither is.
 */
export function approvalOffer(
  request: ReleaseRequest,
  eligibility: EligibilityRead,
): ApprovalOffer {
  const requirements = request.approvalRequirements;
  if (!Array.isArray(requirements) || requirements.length === 0) return AS_BEFORE;
  if (!eligibility || eligibility.status === 'error') return AS_BEFORE;
  if (eligibility.status === 'loading' || !eligibility.value) {
    return { approve: false, decline: false, note: null };
  }
  const eligible = new Set(eligibility.value.eligibleRequirementIds ?? []);
  const named = requirements.filter((requirement) => eligible.has(requirement.id ?? ''));
  const approve = named.some((requirement) => requirement.satisfied !== true);
  const decline = named.length > 0;
  return {
    approve,
    decline,
    note: decline
      ? null
      : 'You hold none of the roles these requirements admit, so you cannot decide on this fold.',
  };
}
