import type {
  DispatchWorkResponses,
  ListProjectWorkResponses,
  ListWrapperClosingsResponses,
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
 * section shows each entity as a small card (qualified id, title, archetype), placed by its own status,
 * nested under its `parent` and ranked among its siblings by its `priority` (qits-753; null when
 * nobody ranked it). Each card says how many of the items the entity needs are not at their
 * status yet (`app-work-needs`, epic qits-1899): `unmetNeeds`, and each need's item (`qualifiedId`),
 * the status it needs and whether it is `met`, for the badge's tooltip.
 */
export const LIST_PROJECT_WORK = [
  'entities[].id',
  'entities[].qualifiedId',
  'entities[].title',
  'entities[].archetype',
  'entities[].status',
  'entities[].parent',
  'entities[].priority',
  'entities[].needs[].qualifiedId',
  'entities[].needs[].status',
  'entities[].needs[].currentStatus',
  'entities[].needs[].met',
  'entities[].unmetNeeds',
] as const;

/** One work entity, cut to what the store reads. */
export type WorkEntry = NonNullable<
  Consumed<ListProjectWorkResponses[200], typeof LIST_PROJECT_WORK>['entities']
>[number];

/**
 * `WrapperClosingsStore.load(projectId)`: where each VERIFIED ticket's wrapper closing stands
 * (`listWrapperClosings`, qits-1873), one row per ticket, matched to it by its qualified id
 * (`ticket`). A VERIFIED ticket's line says it (`app-wrapper-closing`): the verdict of the
 * platform's close rules, the ledger step (`LIVE` tells a finalized request from the empty
 * wrapper's withdrawal), and the request the row names, by its qualified id (the link to its page),
 * its state and its approval (`WAITING` says "waiting on approval"). Every member is null when the
 * row has none.
 */
export const LIST_WRAPPER_CLOSINGS = [
  'closings[].ticket',
  'closings[].verdict',
  'closings[].step',
  'closings[].requestQualifiedId',
  'closings[].requestState',
  'closings[].approval',
] as const;

/** One VERIFIED ticket's wrapper closing, cut to what the store reads. */
export type WrapperClosing = NonNullable<
  Consumed<ListWrapperClosingsResponses[200], typeof LIST_WRAPPER_CLOSINGS>['closings']
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
 * Whether an entry can be finished (moved to DONE) from the Acceptance list: a VERIFIED epic.
 * A ticket's own DONE move is the platform's: it sets a ticket DONE itself once the workspace's
 * wrapper release request is finalized, and qits-projects-service now refuses any caller's move
 * of a TICKET to DONE (qits-150). The epic's manual finish stays.
 */
export function finishable(entry: WorkEntry): boolean {
  return entry.status === 'VERIFIED' && entry.archetype === 'EPIC';
}

/** The move answer, cut to what the store reads. */
export type MovedEntity = Consumed<SetWorkStatusResponses[200], typeof SET_WORK_STATUS>;
/** The dispatch answer, cut to what the store reads. */
export type DispatchedEntity = Consumed<DispatchWorkResponses[200], typeof DISPATCH_WORK>;
