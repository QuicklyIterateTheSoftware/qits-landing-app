import { qitsOperation } from '@qits/angular';
import {
  listProjectRepositories,
  postProjectsApiProjectsByProjectIdRepositoriesBackupSync,
} from '../../api/projects';
import {
  BACKUP_SYNC_PROJECT,
  LIST_PROJECT_REPOSITORIES,
  PROJECT_WRAPPER,
} from './repositories.consumes';

/**
 * qits-projects' repository reads and writes declared as operations (qits-2145), for the pages
 * that read through `qitsResource` (qits-2143, qits-2146);
 * `repositories.operations.pact.spec.ts` binds each with the same provider, operationId and
 * `consumes`.
 */

/**
 * The project's repositories (`listProjectRepositories`), as far as the Agents page and a project
 * card read them (`PROJECT_WRAPPER`): which one is the wrapper, and its main branch (whose commits
 * read the list again), and each repository's id (the card counts them and sums their lines).
 */
export const LIST_PROJECT_WRAPPER = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectRepositories',
  method: 'GET',
  call: listProjectRepositories,
  consumes: PROJECT_WRAPPER,
});

/**
 * The project's repositories (`listProjectRepositories`) whole (`LIST_PROJECT_REPOSITORIES`): the
 * Repositories page's cards and tree, and the UI builder's scope (each repository's component).
 */
export const PROJECT_REPOSITORIES = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectRepositories',
  method: 'GET',
  call: listProjectRepositories,
  consumes: LIST_PROJECT_REPOSITORIES,
});

/**
 * Pushes every repository of the project to its backup remote (`backupSyncProject`): the
 * Repositories page's nudge after the backup sign-in ends, which reads how many were scheduled.
 */
export const BACKUP_SYNC = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'backupSyncProject',
  method: 'POST',
  call: postProjectsApiProjectsByProjectIdRepositoriesBackupSync,
  consumes: BACKUP_SYNC_PROJECT,
});
