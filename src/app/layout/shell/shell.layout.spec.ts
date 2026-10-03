import { workSubpage } from './shell.layout';

describe('workSubpage', () => {
  const project = '/projects/qits';
  const work = `${project}/work`;

  it('names each tab', () => {
    expect(workSubpage(`${work}/campaigns`, project)).toEqual({
      label: 'Campaigns',
      path: `${work}/campaigns`,
    });
    expect(workSubpage(`${work}/refinement`, project)).toEqual({
      label: 'Refinement',
      path: `${work}/refinement`,
    });
    expect(workSubpage(`${work}/in-progress`, project)?.label).toBe('In Progress');
    expect(workSubpage(`${work}/acceptance`, project)?.label).toBe('Acceptance');
    expect(workSubpage(`${work}/archive?x=1`, project)).toEqual({
      label: 'Archive',
      path: `${work}/archive`,
    });
  });

  it('names an item by its id', () => {
    expect(workSubpage(`${work}/detail/qits-112`, project)).toEqual({
      label: 'qits-112',
      path: `${work}/detail/qits-112`,
    });
    expect(workSubpage(`${work}/detail/qits-112?tab=x`, project)?.label).toBe('qits-112');
  });

  it('has no crumb for the section itself or for other pages', () => {
    expect(workSubpage(work, project)).toBeUndefined();
    expect(workSubpage(`${work}/detail`, project)).toBeUndefined();
    expect(workSubpage(`${work}/qits-112`, project)).toBeUndefined();
    expect(workSubpage(`${project}/work-archive`, project)).toBeUndefined();
    expect(workSubpage(`${project}/workspaces`, project)).toBeUndefined();
    expect(workSubpage(`${project}/setup`, project)).toBeUndefined();
  });
});
