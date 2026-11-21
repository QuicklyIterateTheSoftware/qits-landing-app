import type { Consumed } from '@qits/angular';
import type { ListRepositoryReleaseRequestsResponses } from '../../api/projects';

/**
 * `REPOSITORY_RELEASE_REQUESTS` (qits-2506): one repository's release requests, newest first, as
 * its Release requests page lists them: each one's id and logical id, state, version, approval
 * (state, by whom, when), the branches it carries (`items[].label`) and when it last changed.
 */
export const LIST_REPOSITORY_RELEASE_REQUESTS = [
  'requests[].id',
  'requests[].qualifiedId',
  'requests[].state',
  'requests[].version',
  'requests[].approvalState',
  'requests[].approvedBy',
  'requests[].approvedAt',
  'requests[].items[].label',
  'requests[].updatedAt',
] as const;

/** One repository's release requests, cut to what the page reads. */
export type RepositoryReleaseRequests = Consumed<
  ListRepositoryReleaseRequestsResponses[200],
  typeof LIST_REPOSITORY_RELEASE_REQUESTS
>;

/** One of them. */
export type RepositoryReleaseRequest = NonNullable<RepositoryReleaseRequests['requests']>[number];
