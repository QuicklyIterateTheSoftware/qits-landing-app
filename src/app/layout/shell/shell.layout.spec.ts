import { globalLeaf, repositoryAt } from './shell.layout';

describe('repositoryAt', () => {
  const project = '/projects/qits';

  it('names the repository a page is on, and the segments below it', () => {
    expect(repositoryAt(`${project}/components/qits-qits`, project)).toEqual({
      repo: 'qits-qits',
      rest: [],
    });
    expect(repositoryAt(`${project}/components/qits-qits/?x=1`, project)).toEqual({
      repo: 'qits-qits',
      rest: [],
    });
    expect(repositoryAt(`${project}/components/a%2Fb/contracts/s%201#x`, project)).toEqual({
      repo: 'a/b',
      rest: ['contracts', 's%201'],
    });
    expect(
      repositoryAt(`${project}/components/qits-landing-app/ui-builder?tab=x`, project),
    ).toEqual({ repo: 'qits-landing-app', rest: ['ui-builder'] });
  });

  it('is undefined for the list itself and anywhere else', () => {
    expect(repositoryAt(`${project}/components`, project)).toBeUndefined();
    expect(repositoryAt(`${project}/components/`, project)).toBeUndefined();
    expect(repositoryAt(`${project}/components?x=1`, project)).toBeUndefined();
    expect(repositoryAt(`${project}/work/detail/qits-111`, project)).toBeUndefined();
    expect(repositoryAt('/projects/other/components/qits-qits', project)).toBeUndefined();
  });
});

describe('globalLeaf', () => {
  it('names the page right below a global section page by its decoded id', () => {
    expect(globalLeaf('/system/swarm/services/abc', '/system/swarm/services')).toBe('abc');
    expect(globalLeaf('/system/swarm/nodes/n%201/containers?x=1', '/system/swarm/nodes')).toBe(
      'n 1',
    );
    expect(globalLeaf('/system/terminals/7#top', '/system/terminals')).toBe('7');
    expect(globalLeaf('/mirror/repositories/%zz', '/mirror/repositories')).toBe('%zz');
  });

  it('is undefined for the page itself and anywhere else', () => {
    expect(globalLeaf('/system/swarm/services', '/system/swarm/services')).toBeUndefined();
    expect(globalLeaf('/system/swarm/services/', '/system/swarm/services')).toBeUndefined();
    expect(globalLeaf('/system/swarm/servicesx/a', '/system/swarm/services')).toBeUndefined();
    expect(globalLeaf('/system/swarm/services?x=1', '/system/swarm/services')).toBeUndefined();
  });
});
