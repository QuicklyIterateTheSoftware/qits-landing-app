import { contractsLink, contractStateLink, entitiesLink, entityLink } from './contracts-links';

describe('contracts links', () => {
  it('gives the router commands of each page, one segment each', () => {
    expect(contractsLink('qits', 'qits-projects-service')).toEqual([
      '/projects',
      'qits',
      'repositories',
      'qits-projects-service',
      'contracts',
    ]);
    expect(contractStateLink('qits', 'r', 'a-project-exists')).toEqual([
      '/projects',
      'qits',
      'repositories',
      'r',
      'contracts',
      'a-project-exists',
    ]);
    expect(entitiesLink('qits', 'r')).toEqual([
      '/projects',
      'qits',
      'repositories',
      'r',
      'entities',
    ]);
    expect(entityLink('qits', 'r', 'a.b.Project')).toEqual([
      '/projects',
      'qits',
      'repositories',
      'r',
      'entities',
      'a.b.Project',
    ]);
  });
});
