import { qitsOperation } from '@qits/angular';
import { listRepositories } from '../../api/mirror';
import { LIST_REPOSITORIES } from './repositories.consumes';

/**
 * qits-mirror's cache roots (qits-2471) declared as an operation, read by the Mirror section's
 * Caches page through its own `qitsResource`; `repositories.operations.pact.spec.ts` binds it.
 *
 * `REPOSITORY_LIST`: `GET /mirror/api/repositories`, `{ repositories: [...] }` by name: the npm
 * and maven caches and one OCI namespace per upstream. A running mirror re-seeds its two package
 * caches at boot, so `repositories: []` is rare; a database fault is a 5xx, never an empty list.
 */
export const REPOSITORY_LIST = qitsOperation({
  provider: 'qits-mirror-service',
  operationId: 'listRepositories',
  method: 'GET',
  call: listRepositories,
  consumes: LIST_REPOSITORIES,
});
