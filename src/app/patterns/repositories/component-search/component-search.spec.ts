import { matchRepositories, SEARCH_MATCHES } from './component-search';

describe('matchRepositories', () => {
  const repositories = [
    { id: '1', name: 'qits-artifacts-service' },
    { id: '2', name: 'qits-ci-service' },
    { id: '3', name: 'qits-Artifacts-cli' },
  ];

  it('lists the repositories whose name holds the text, ignoring case, in their order', () => {
    expect(matchRepositories(repositories, 'ARTI').map((r) => r.id)).toEqual(['1', '3']);
  });

  it('lists none for an empty text', () => {
    expect(matchRepositories(repositories, '  ')).toEqual([]);
  });

  it('lists at most SEARCH_MATCHES', () => {
    const many = Array.from({ length: SEARCH_MATCHES + 5 }, (_, i) => ({
      id: `${i}`,
      name: `r${i}`,
    }));
    expect(matchRepositories(many, 'r')).toHaveLength(SEARCH_MATCHES);
  });
});
