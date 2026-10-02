import { goldenMaster } from '../../../testing/golden-masters';
import type { RepositoryEntry } from './repositories.consumes';
import { repositoryTree, type TreeNode } from './repository-tree';

const STATE = 'a project with repositories in components';

/** The tree as text: `dir/` for a directory, the name for a repository, indented by depth. */
function outline(nodes: readonly TreeNode[], depth = 0): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'folder'
      ? [`${'  '.repeat(depth)}${node.name}/`, ...outline(node.children, depth + 1)]
      : [`${'  '.repeat(depth)}${node.entry.repository?.name}`],
  );
}

describe('repositoryTree', () => {
  it('lays the repositories out the way the wrapper mounts them, the wrapper on top', () => {
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const tree = repositoryTree(answer.entries, answer.wrapper);
    expect(tree.wrapper?.repository?.archetype).toBe('PROJECT');
    expect(outline(tree.nodes)).toEqual([
      'components/',
      '  billing/',
      '    billing-daemon',
      '    billing-javalib',
      '  contract/',
      '    contract-frontend',
      '    contract-service',
    ]);
    expect(tree.other).toEqual([]);
  });

  it('puts a repository the wrapper does not mount into other', () => {
    // Derived from the recording: one more repository under a new id, which no wrapper entry
    // names. qits-projects records no state with an undeclared repository.
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const undeclared: RepositoryEntry = {
      repository: { ...answer.entries[0].repository, id: 'undeclared-id', name: 'loose-cli' },
    };
    const tree = repositoryTree([...answer.entries, undeclared], answer.wrapper);
    expect(tree.other.map((entry) => entry.repository?.name)).toEqual(['loose-cli']);
  });

  it('without a wrapper view, every repository is other', () => {
    const answer = goldenMaster(STATE, 'listProjectRepositories');
    const tree = repositoryTree(answer.entries, undefined);
    expect(tree.wrapper).toBeUndefined();
    expect(tree.nodes).toEqual([]);
    expect(tree.other).toHaveLength(answer.entries.length);
  });
});
