import { projectsGoldenMasters as masters } from '../../../testing/golden-masters';
import { filterRequests, requestFilterOf, stateQueryOf } from './repository-release-requests';
import type { RepositoryReleaseRequest } from './repository-release-requests.consumes';

/** "a repository with a release not merged to main": rr-3 withdrawn, rr-2 released, rr-1 finalized. */
const all = (): RepositoryReleaseRequest[] =>
  masters.body('a repository with a release not merged to main', 'listRepositoryReleaseRequests')
    .requests;

describe('repository release request filters', () => {
  it('reads ?state=, all by default', () => {
    expect(requestFilterOf(null)).toBe('all');
    expect(requestFilterOf('nonsense')).toBe('all');
    expect(requestFilterOf('closed')).toBe('closed');
  });

  it('asks the door for the open ones by default, else the whole history', () => {
    expect(stateQueryOf('open')).toBeUndefined();
    expect(stateQueryOf('all')).toBe('all');
    expect(stateQueryOf('released')).toBe('all');
    expect(stateQueryOf('closed')).toBe('all');
  });

  it('narrows the history in its order', () => {
    const ids = (filter: Parameters<typeof filterRequests>[1]) =>
      filterRequests(all(), filter).map((request) => request.qualifiedId);
    expect(ids('all')).toEqual([
      'contract-service-rr-3',
      'contract-service-rr-2',
      'contract-service-rr-1',
    ]);
    expect(ids('released')).toEqual(['contract-service-rr-2', 'contract-service-rr-1']);
    expect(ids('closed')).toEqual(['contract-service-rr-3']);
    expect(ids('open')).toEqual([]);
  });
});
