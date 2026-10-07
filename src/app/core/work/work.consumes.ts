import type {
  DispatchWorkResponses,
  GetWorkResponses,
  ListProjectWorkResponses,
  ListWorkMembersResponses,
  SetWorkStatusResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkStore` reads from qits-projects' answer (epic qits-112). The store passes this to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 */

/**
 * `WorkStore.load(projectId)`: the project's whole planning tree, unfiltered (`listProjectWork`), one
 * request shared by the card and the work section. The card counts entries by status ({@link countsAsWork}); the work
 * section shows each entity as a small card (qualified id, title, archetype), placed by its own status
 * and nested under its `parent`.
 */
export const LIST_PROJECT_WORK = [
  'entities[].id',
  'entities[].qualifiedId',
  'entities[].title',
  'entities[].archetype',
  'entities[].status',
  'entities[].parent',
] as const;

/** One work entity, cut to what the store reads. */
export type WorkEntry = NonNullable<
  Consumed<ListProjectWorkResponses[200], typeof LIST_PROJECT_WORK>['entities']
>[number];

/**
 * Which work entities the card's "Work" tile counts. FOR NOW: every REFINED entity but a feature
 * or a task (they hold a status since qits-763, and the tile counted the items they belong to). This
 * is a stand-in the user will replace with a better representation; change it here and nowhere
 * else.
 */
export function countsAsWork(entry: WorkEntry): boolean {
  return entry.status === 'REFINED' && entry.archetype !== 'FEATURE' && entry.archetype !== 'TASK';
}

/**
 * `WorkStore.load(projectId)`, for each campaign in the tree: its members, in campaign order
 * (`listWorkMembers`, by the campaign's qualified id). Campaign membership is not on the entity; the
 * campaign's members answer holds it.
 */
export const LIST_WORK_MEMBERS = ['members[].entity.id'] as const;

/** A campaign's members, cut to what the store reads. */
export type CampaignMembers = Consumed<ListWorkMembersResponses[200], typeof LIST_WORK_MEMBERS>;

/**
 * `WorkStore.load(projectId)`, for each campaign in the tree: its description (`getWork`, by the
 * campaign's qualified id), which the Campaigns page shows at its start. The project's work list
 * does not carry descriptions.
 */
export const GET_CAMPAIGN_DESCRIPTION = ['description'] as const;

/** A campaign's description, cut to what the store reads. */
export type CampaignDescription = Consumed<GetWorkResponses[200], typeof GET_CAMPAIGN_DESCRIPTION>;

/**
 * `WorkStore.transition(projectId, entry, target)` and `finish(projectId, entry)`: the entity's
 * new status (`setWorkStatus`, one door for every archetype, by qualified id), which the store writes into its
 * entry so the item moves at once.
 */
export const SET_WORK_STATUS = ['status'] as const;

/**
 * `WorkStore.dispatch(projectId, entry, mode)`: which phase the press started (`dispatchWork`, by qualified
 * id).
 * The answer carries no status: the platform's move (to IMPLEMENTING, VERIFYING) arrives as an
 * `EntityTransitioned` event, which refetches the work.
 */
export const DISPATCH_WORK = ['dispatch.phase'] as const;

/**
 * Whether an entry can be finished (moved to DONE) from the Acceptance list: a VERIFIED epic or
 * ticket.
 */
export function finishable(entry: WorkEntry): boolean {
  return (
    entry.status === 'VERIFIED' && (entry.archetype === 'EPIC' || entry.archetype === 'TICKET')
  );
}

/** The move answer, cut to what the store reads. */
export type MovedEntity = Consumed<SetWorkStatusResponses[200], typeof SET_WORK_STATUS>;
/** The dispatch answer, cut to what the store reads. */
export type DispatchedEntity = Consumed<DispatchWorkResponses[200], typeof DISPATCH_WORK>;
