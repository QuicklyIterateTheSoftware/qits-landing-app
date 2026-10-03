import { workSubpage } from './shell.layout';

describe('workSubpage', () => {
  const project = '/projects/qits';
  const work = `${project}/work`;

  it('names the archive and an item by its id', () => {
    expect(workSubpage(`${project}/work-archive`, project)).toEqual({
      label: 'Archive',
      path: `${project}/work-archive`,
    });
    expect(workSubpage(`${project}/work-archive?x=1`, project)?.label).toBe('Archive');
    expect(workSubpage(`${work}/qits-112`, project)).toEqual({
      label: 'qits-112',
      path: `${work}/qits-112`,
    });
    expect(workSubpage(`${work}/qits-112?tab=x`, project)?.label).toBe('qits-112');
  });

  it('has no crumb for the section itself or for other pages', () => {
    expect(workSubpage(work, project)).toBeUndefined();
    expect(workSubpage(`${project}/workspaces`, project)).toBeUndefined();
    expect(workSubpage(`${project}/work-archived`, project)).toBeUndefined();
    expect(workSubpage(`${project}/setup`, project)).toBeUndefined();
  });
});
