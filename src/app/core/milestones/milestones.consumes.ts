import type {
  GetMilestoneResponses,
  ListProjectMilestonesResponses,
  SetWorkMemberMilestonesResponses,
  AttachWorkMilestoneResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `MilestonesStore` reads from qits-projects' milestone doors (epic qits-615). The store passes
 * each list to `consume(...)`, so it cannot read any other field, and its pact spec passes the same
 * lists as `consumes`. To read another field, add it here.
 */

/**
 * One milestone, as the Milestones pages show it: its name, when it was made and since when it is
 * met (`satisfiedAt`, null while unmet), and its condition: OR'd groups of AND'd criteria, each
 * with its own dates, its kind and predicate, and how it came to hold (the event's `summary`, or a
 * person's approval with its note). Then what needs it: the work entities (linked by qualified id)
 * and the campaign memberships.
 */
const MILESTONE_FIELDS = [
  'id',
  'displayName',
  'createdAt',
  'satisfiedAt',
  'met',
  'groups[].id',
  'groups[].createdAt',
  'groups[].satisfiedAt',
  'groups[].criteria[].id',
  'groups[].criteria[].kind',
  'groups[].criteria[].predicate',
  'groups[].criteria[].createdAt',
  'groups[].criteria[].satisfiedAt',
  'groups[].criteria[].evidence.summary',
  'groups[].criteria[].approval.approvedBy',
  'groups[].criteria[].approval.note',
  'entities[].id',
  'entities[].qualifiedId',
  'entities[].archetype',
  'entities[].title',
  'entities[].status',
  'memberships[].membershipId',
  'memberships[].campaignQualifiedId',
  'memberships[].campaignTitle',
  'memberships[].entityQualifiedId',
] as const;

type Prefixed<P extends string, T extends readonly string[]> = {
  readonly [K in keyof T]: `${P}${T[K]}`;
};

function prefixed<P extends string, T extends readonly string[]>(
  prefix: P,
  fields: T,
): Prefixed<P, T> {
  return fields.map((field) => `${prefix}${field}`) as unknown as Prefixed<P, T>;
}

/** `listProjectMilestones`, by project: every milestone of it, oldest first. */
export const LIST_PROJECT_MILESTONES = prefixed('milestones[].', MILESTONE_FIELDS);

/**
 * `getMilestone`, and the answer of every milestone write (`createMilestone`, `renameMilestone`,
 * `setMilestoneGroups`, `approveMilestoneCriterion`): the milestone as it stands.
 */
export const MILESTONE = prefixed('milestone.', MILESTONE_FIELDS);

/** One milestone, cut to what the store reads. */
export type Milestone = NonNullable<
  Consumed<GetMilestoneResponses[200], typeof MILESTONE>['milestone']
>;

/** A milestone of the list, cut to what the store reads (the same fields as {@link Milestone}). */
export type MilestoneEntry = NonNullable<
  Consumed<ListProjectMilestonesResponses[200], typeof LIST_PROJECT_MILESTONES>['milestones']
>[number];

/**
 * `attachWorkMilestone` and `detachWorkMilestone`, by qualified id: the milestones the item needs
 * now, in the order attached.
 */
export const WORK_MILESTONES = [
  'milestones[].id',
  'milestones[].displayName',
  'milestones[].satisfiedAt',
] as const;

/** An item's milestones as a write left them, cut to what the store reads. */
export type WorkMilestones = Consumed<AttachWorkMilestoneResponses[200], typeof WORK_MILESTONES>;

/** `setWorkMemberMilestones`: the membership and the milestones it needs now. */
export const MEMBER_MILESTONES = [
  'member.membershipId',
  'member.milestones[].id',
  'member.milestones[].displayName',
  'member.milestones[].satisfiedAt',
] as const;

/** A membership's milestones as the write left them, cut to what the store reads. */
export type MemberMilestones = Consumed<
  SetWorkMemberMilestonesResponses[200],
  typeof MEMBER_MILESTONES
>;

/** A refusal (400, 403, 404, 409): the service's own words. */
export const MILESTONE_REFUSAL = ['message'] as const;
