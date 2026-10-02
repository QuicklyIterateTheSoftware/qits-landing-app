import type { ListProjectEntitiesResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `WorkStore` reads from qits-projects' answer (epic qits-112). The store passes this to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 */

/**
 * `WorkStore.load(projectId)`: the project's whole planning tree, unfiltered, one request shared by the
 * card and the Work page. The card counts entries by status ({@link countsAsWork}); the Work page
 * shows each entity as a small card: its qualified id, title and archetype, grouped by status.
 */
export const LIST_PROJECT_ENTITIES = [
  'entities[].id',
  'entities[].qualifiedId',
  'entities[].title',
  'entities[].archetype',
  'entities[].status',
] as const;

/** One work entity, cut to what the store reads. */
export type WorkEntry = NonNullable<
  Consumed<ListProjectEntitiesResponses[200], typeof LIST_PROJECT_ENTITIES>['entities']
>[number];

/**
 * Which work entities the card's "Work" tile counts. FOR NOW: every archetype whose status is
 * REFINED. Features and tasks have no status, so they do not count yet. This is a stand-in the
 * user will replace with a better representation; change it here and nowhere else.
 */
export function countsAsWork(entry: WorkEntry): boolean {
  return entry.status === 'REFINED';
}
