import type {
  ListProjectEntitiesResponses,
  GetProjectResponses,
  ListProjectRepositoriesResponses,
  ListProjectsResponses,
} from '../../api/projects';
import { NOTHING, type Consumed } from '@qits/angular';

/**
 * What `ProjectsStore` reads from each qits-projects answer (epic qits-546). The store passes
 * these to `consume(...)`, so it cannot read any other field, and its pact spec passes the same
 * lists as `consumes`, so the pact binds exactly these fields. To read another field, add it here.
 */

/** `load()` / `refresh()`: the picker's cards show each project's name and link to its slug. */
export const LIST_PROJECTS = [
  'entries[].project.id',
  'entries[].project.name',
  'entries[].project.slug',
] as const;

/** `refresh(id)`: the fetched project joins the list, so it needs the same fields. */
export const GET_PROJECT = ['project.id', 'project.name', 'project.slug'] as const;

/**
 * `loadRepositories(projectId)`: the card counts the entries, and sums their lines of code by
 * repository id (`LocStore`).
 */
export const LIST_PROJECT_REPOSITORIES = ['entries[].repository.id'] as const;

/**
 * `loadWork(projectId)`: the project's whole planning tree, unfiltered, one request shared by the
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

/** `hasSession()`: the status only. */
export const SESSION_CHECK = NOTHING;

/** A project as the list answer gives it, cut to what the store reads. */
export type ListedProject = NonNullable<
  NonNullable<
    Consumed<ListProjectsResponses[200], typeof LIST_PROJECTS>['entries']
  >[number]['project']
>;

/** A project as the detail answer gives it, cut to what the store reads. */
export type FetchedProject = NonNullable<
  Consumed<GetProjectResponses[200], typeof GET_PROJECT>['project']
>;

/** One repository entry, cut to what the store reads: its repository's id. */
export type RepositoryEntry = NonNullable<
  Consumed<ListProjectRepositoriesResponses[200], typeof LIST_PROJECT_REPOSITORIES>['entries']
>[number];
