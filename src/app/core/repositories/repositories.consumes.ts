import type {
  ListProjectRepositoriesResponses,
  PostProjectsApiProjectsByProjectIdRepositoriesBackupSyncResponses,
} from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What the app reads from qits-projects' repositories answer (epic qits-112). Each operation of
 * `repositories.operations.ts` (and `RepositoriesStore`, until the release request page moves)
 * reads its list through `consume(...)`, so it cannot read any other field, and
 * `repositories.operations.pact.spec.ts` binds the same lists. To read another field, add it here.
 *
 * `PROJECT_REPOSITORIES` (`repositories.operations.ts`, qits-2146), and `RepositoriesStore` for the
 * release request page:
 * - the Repositories page shows each repository as a card (name, archetype, backup state; clone URL, backup URL
 *   and main branch in its expandable section), placed in a tree by the wrapper's paths
 *   (`components/<component>/<name>`), the wrapper itself at the top;
 * - the UI builder (qits-1951) reads each repository's `component`: a frontend other than the
 *   project's landing app shows only the calls to providers of its own component.
 */
export const LIST_PROJECT_REPOSITORIES = [
  'entries[].repository.id',
  'entries[].repository.name',
  'entries[].repository.archetype',
  'entries[].repository.component',
  'entries[].repository.mainBranch',
  'entries[].repository.backupUrl',
  'entries[].repository.cloneUrl',
  'entries[].repository.lastBackup.outcome',
  'wrapper.repositoryId',
  'wrapper.entries[].path',
  'wrapper.entries[].repositoryId',
] as const;

/**
 * `LIST_PROJECT_WRAPPER` (`repositories.operations.ts`, qits-2143), the Agents page's own read of
 * the project's repositories: which repository is the wrapper (`wrapper.repositoryId`), whose slots
 * and agents the page then reads, and that repository's main branch (`entries[].repository.id`,
 * `mainBranch`), the branch a commit to which reads the list again (`SCMPublishCommit`, as
 * `RepositoriesStore.follow` does). A part of `LIST_PROJECT_REPOSITORIES`, so its pact interaction
 * binds only these.
 *
 * A project card reads the same (qits-2146): it counts the entries and sums their lines of code by
 * repository id, and reads its count again after a commit to the wrapper's main branch.
 */
export const PROJECT_WRAPPER = [
  'entries[].repository.id',
  'entries[].repository.mainBranch',
  'wrapper.repositoryId',
] as const satisfies readonly (typeof LIST_PROJECT_REPOSITORIES)[number][];

type Answer = Consumed<ListProjectRepositoriesResponses[200], typeof LIST_PROJECT_REPOSITORIES>;

/** One repository entry, cut to what the store reads. */
export type RepositoryEntry = NonNullable<Answer['entries']>[number];

/** The wrapper's view, cut to what the store reads: its id and its entries' paths. */
export type WrapperView = NonNullable<Answer['wrapper']>;

/**
 * `BACKUP_SYNC` (qits-projects' `backupSyncProject`, qits-2146): the Repositories
 * page nudges every repository's backup after the backup sign-in ends, and reads how many were
 * scheduled. A refusal (404 for a project it does not know, 403 without the role) binds the status
 * only.
 */
export const BACKUP_SYNC_PROJECT = ['scheduled'] as const;

/** A scheduled backup sync, cut to what the store reads. */
export type BackupSync = Consumed<
  PostProjectsApiProjectsByProjectIdRepositoriesBackupSyncResponses[202],
  typeof BACKUP_SYNC_PROJECT
>;
