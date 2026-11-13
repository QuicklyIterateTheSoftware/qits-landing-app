import { movesWrapper, type WrapperBranches } from './wrapper-commits';

const event = (payload: object) => ({ name: 'SCMPublishCommit', payload: JSON.stringify(payload) });

const repositories: WrapperBranches = {
  wrapper: { repositoryId: 'w' },
  entries: [{ repository: { id: 'w', mainBranch: 'trunk' } }, { repository: { id: 'r' } }],
};

describe('movesWrapper', () => {
  it('is a commit to the wrapper’s main branch', () => {
    expect(movesWrapper(event({ repoId: 'w', branch: 'trunk' }), repositories)).toBe(true);
  });

  it('is not a commit to another branch of the wrapper, or to another repository', () => {
    expect(movesWrapper(event({ repoId: 'w', branch: 'ticket/x' }), repositories)).toBe(false);
    expect(movesWrapper(event({ repoId: 'r', branch: 'trunk' }), repositories)).toBe(false);
  });

  it('takes main for a wrapper whose entry names no main branch, and nothing before a read', () => {
    const plain: WrapperBranches = { wrapper: { repositoryId: 'w' }, entries: [] };
    expect(movesWrapper(event({ repoId: 'w', branch: 'main' }), plain)).toBe(true);
    expect(movesWrapper(event({ repoId: 'w', branch: 'main' }), undefined)).toBe(false);
  });
});
