import { qitsOperation } from '@qits/angular';
import { listRepositoryReleaseRequests } from '../../api/projects';
import { LIST_REPOSITORY_RELEASE_REQUESTS } from './repository-release-requests.consumes';

/**
 * One repository's release requests (`listRepositoryReleaseRequests`, qits-2506): with no `state`
 * the open ones plus the last ten released, with `state=all` the whole history, with a state name
 * only those. Newest first.
 */
export const REPOSITORY_RELEASE_REQUESTS = qitsOperation({
  provider: 'qits-projects-service',
  operationId: 'listRepositoryReleaseRequests',
  method: 'GET',
  call: listRepositoryReleaseRequests,
  consumes: LIST_REPOSITORY_RELEASE_REQUESTS,
});
