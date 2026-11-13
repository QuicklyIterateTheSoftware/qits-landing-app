import { notRemoved, ofProject } from './agent-lists';

describe('notRemoved and ofProject', () => {
  it('leaves out the removed agents, keeping the order', () => {
    const agents = [{ state: 'ACTIVE' }, { state: 'REMOVED' }, { state: 'OBSOLETE' }, {}];
    expect(notRemoved(agents)).toEqual([{ state: 'ACTIVE' }, { state: 'OBSOLETE' }, {}]);
    expect(notRemoved(undefined)).toEqual([]);
  });

  it('tells a project’s items by their qualified id, exactly', () => {
    expect(ofProject('qits-12', 'qits')).toBe(true);
    expect(ofProject('qits-ci-3', 'qits')).toBe(false);
    expect(ofProject('qits-ci-3', 'qits-ci')).toBe(true);
    expect(ofProject('qits-x', 'qits')).toBe(false);
    expect(ofProject(undefined, 'qits')).toBe(false);
    expect(ofProject('qits-12', undefined)).toBe(false);
  });
});
