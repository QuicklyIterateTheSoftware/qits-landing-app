import { qitsOperation } from '@qits/angular';
import { listProjectRepositories } from '../../api/projects';
import { PROJECT_WRAPPER } from './repositories.consumes';

/**
 * qits-projects' reads declared as operations (qits-2145), for the pages that read through
 * `qitsResource` instead of `RepositoriesStore` (qits-2143); `repositories.operations.pact.spec.ts`
 * binds each with the same provider, operationId and `consumes`.
 */

/**
 * The project's repositories (`listProjectRepositories`), as far as the Agents page reads them:
 * which one is the wrapper, and its main branch (`PROJECT_WRAPPER`).
 */
export const LIST_PROJECT_WRAPPER = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listProjectRepositories',
  method: 'GET',
  call: listProjectRepositories,
  consumes: PROJECT_WRAPPER,
});
