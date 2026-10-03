import type { ListProjectRepositoriesResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `RepositoriesStore` reads from qits-projects' answer (epic qits-112). The store passes this
 * to `consume(...)`, so it cannot read any other field, and its pact spec passes the same list as
 * `consumes`. To read another field, add it here.
 *
 * `RepositoriesStore.load(projectId)`, one request per project shared by the project card and the
 * Repositories page:
 * - the card counts the entries and sums their lines of code by repository id (`LocStore`);
 * - the page shows each repository as a card (name, archetype, backup state; clone URL, backup URL
 *   and main branch in its expandable section), placed in a tree by the wrapper's paths
 *   (`components/<component>/<name>`), the wrapper itself at the top.
 */
export const LIST_PROJECT_REPOSITORIES = [
  'entries[].repository.id',
  'entries[].repository.name',
  'entries[].repository.archetype',
  'entries[].repository.mainBranch',
  'entries[].repository.backupUrl',
  'entries[].repository.cloneUrl',
  'entries[].repository.lastBackup.outcome',
  'wrapper.repositoryId',
  'wrapper.entries[].path',
  'wrapper.entries[].repositoryId',
] as const;

/**
 * The part of that answer the project card relies on: the entries' ids (it counts them and joins
 * them with their lines of code). Its pact interaction binds only these; the store still reads the
 * whole list above.
 */
export const PROJECT_CARD_REPOSITORIES = ['entries[].repository.id'] as const;

type Answer = Consumed<ListProjectRepositoriesResponses[200], typeof LIST_PROJECT_REPOSITORIES>;

/** One repository entry, cut to what the store reads. */
export type RepositoryEntry = NonNullable<Answer['entries']>[number];

/** The wrapper's view, cut to what the store reads: its id and its entries' paths. */
export type WrapperView = NonNullable<Answer['wrapper']>;
