import type {
  GetCampaignResponses,
  ListProjectEntitiesResponses,
  TransitionEpicResponses,
  TransitionTicketResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkStore` reads from qits-projects' answer (epic qits-112). The store passes this to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 */

/**
 * `WorkStore.load(projectId)`: the project's whole planning tree, unfiltered, one request shared by the
 * card and the Work page. The card counts entries by status ({@link countsAsWork}); the Work page
 * shows each entity as a small card (qualified id, title, archetype), placed by its status and
 * nested under its `parent`.
 */
export const LIST_PROJECT_ENTITIES = [
  'entities[].id',
  'entities[].qualifiedId',
  'entities[].title',
  'entities[].archetype',
  'entities[].status',
  'entities[].parent',
] as const;

/** One work entity, cut to what the store reads. */
export type WorkEntry = NonNullable<
  Consumed<ListProjectEntitiesResponses[200], typeof LIST_PROJECT_ENTITIES>['entities']
>[number];

/**
 * Which work entities the card's "Work" tile counts. FOR NOW: every entity whose status is
 * REFINED, except features and tasks. They have a status of their own too (qits-763), but they
 * are parts of an epic, not work of their own, and counting them would change the card's number.
 * This is a stand-in the user will replace with a better representation; change it here and
 * nowhere else.
 */
export function countsAsWork(entry: WorkEntry): boolean {
  return entry.status === 'REFINED' && entry.archetype !== 'FEATURE' && entry.archetype !== 'TASK';
}

/**
 * `WorkStore.load(projectId)`, for each campaign in the tree: its members, in campaign order.
 * Campaign membership is not on the entity; the campaign answer holds it.
 */
export const GET_CAMPAIGN = ['campaign.id', 'campaign.members[].entity.id'] as const;

/** A campaign answer, cut to what the store reads. */
export type CampaignEntry = NonNullable<
  Consumed<GetCampaignResponses[200], typeof GET_CAMPAIGN>['campaign']
>;

/**
 * `WorkStore.finish(projectId, entry)` for an epic: the epic's new status, which the store writes
 * into its entry so the epic leaves the board at once.
 */
export const TRANSITION_EPIC = ['epic.status'] as const;

/** `WorkStore.finish(projectId, entry)` for a ticket: the same, from the ticket door. */
export const TRANSITION_TICKET = ['ticket.status'] as const;

/**
 * Whether an entry can be finished (moved to DONE) from the Acceptance list: a VERIFIED epic or
 * ticket.
 */
export function finishable(entry: WorkEntry): boolean {
  return (
    entry.status === 'VERIFIED' && (entry.archetype === 'EPIC' || entry.archetype === 'TICKET')
  );
}

/** The epic answer, cut to what the store reads. */
export type TransitionedEpic = Consumed<TransitionEpicResponses[200], typeof TRANSITION_EPIC>;
/** The ticket answer, cut to what the store reads. */
export type TransitionedTicket = Consumed<TransitionTicketResponses[200], typeof TRANSITION_TICKET>;
