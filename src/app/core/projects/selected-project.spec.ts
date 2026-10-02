import { projectSlugOf } from './selected-project';

describe('projectSlugOf', () => {
  it('reads the slug of a project URL, and nothing from any other', () => {
    expect(projectSlugOf('/projects/alpha')).toBe('alpha');
    expect(projectSlugOf('/projects/alpha/repositories?x=1')).toBe('alpha');
    expect(projectSlugOf('/projects/a%20b')).toBe('a b');
    expect(projectSlugOf('/')).toBeUndefined();
    expect(projectSlugOf('/landing')).toBeUndefined();
    expect(projectSlugOf('/projects')).toBeUndefined();
  });
});
