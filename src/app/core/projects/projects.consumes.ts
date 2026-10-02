import type {
  GetProjectsApiProjectsByIdResponses,
  GetProjectsApiProjectsByProjectIdRepositoriesResponses,
  GetProjectsApiProjectsResponses,
} from '../../api/projects';
import { NOTHING, type Consumed } from '../consume';

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

/** `loadRepositories(projectId)`: the card counts the entries and reads none of their fields. */
export const LIST_PROJECT_REPOSITORIES = ['entries[]'] as const;

/** `hasSession()`: the status only. */
export const SESSION_CHECK = NOTHING;

/** A project as the list answer gives it, cut to what the store reads. */
export type ListedProject = NonNullable<
  NonNullable<
    Consumed<GetProjectsApiProjectsResponses[200], typeof LIST_PROJECTS>['entries']
  >[number]['project']
>;

/** A project as the detail answer gives it, cut to what the store reads. */
export type FetchedProject = NonNullable<
  Consumed<GetProjectsApiProjectsByIdResponses[200], typeof GET_PROJECT>['project']
>;

/** One repository entry, cut to what the store reads: nothing but its existence. */
export type RepositoryEntry = NonNullable<
  Consumed<
    GetProjectsApiProjectsByProjectIdRepositoriesResponses[200],
    typeof LIST_PROJECT_REPOSITORIES
  >['entries']
>[number];
