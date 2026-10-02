import { workSubpage } from './layout';

describe('workSubpage', () => {
  const work = '/projects/qits/work';

  it('names the archive and an item by its id', () => {
    expect(workSubpage(`${work}/archive`, work)).toEqual({
      label: 'Archive',
      path: `${work}/archive`,
    });
    expect(workSubpage(`${work}/qits-112`, work)).toEqual({
      label: 'qits-112',
      path: `${work}/qits-112`,
    });
    expect(workSubpage(`${work}/qits-112?tab=x`, work)?.label).toBe('qits-112');
  });

  it('has no crumb for the section itself or for other pages', () => {
    expect(workSubpage(work, work)).toBeUndefined();
    expect(workSubpage('/projects/qits/workspaces', work)).toBeUndefined();
    expect(workSubpage('/projects/qits/setup', work)).toBeUndefined();
  });
});
