import { releaseRequestSubpage, workspaceCrumb, workSubpage } from './shell.layout';

describe('workspaceCrumb', () => {
  const project = '/projects/qits';

  it('names a work item’s workspace page', () => {
    expect(workspaceCrumb(`${project}/workspaces/qits-111?x=1`, project)).toEqual({
      label: 'Workspace qits-111',
      path: `${project}/workspaces/qits-111`,
    });
  });

  it('is undefined anywhere else', () => {
    expect(workspaceCrumb(`${project}/workspaces/`, project)).toBeUndefined();
    expect(workspaceCrumb(`${project}/work/detail/qits-111`, project)).toBeUndefined();
    expect(workspaceCrumb('/projects/other/workspaces/qits-111', project)).toBeUndefined();
  });
});

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

describe('releaseRequestSubpage', () => {
  const project = '/projects/qits';
  const list = `${project}/release-requests`;
  const id = '00000000-0000-4000-8000-000000000002';

  const requests = [{ id, qualifiedId: 'contract-service-rr-2' }, { id: `${id.slice(0, -1)}3` }];

  it('names a request by its logical id, opened by uuid or by logical id', () => {
    expect(releaseRequestSubpage(`${list}/${id}?x=1`, project, requests)).toEqual({
      label: 'contract-service-rr-2',
      path: `${list}/${id}`,
    });
    expect(releaseRequestSubpage(`${list}/contract-service-rr-2#x`, project, requests)).toEqual({
      label: 'contract-service-rr-2',
      path: `${list}/contract-service-rr-2`,
    });
  });

  it('names a request without a logical id by the start of its uuid', () => {
    expect(releaseRequestSubpage(`${list}/${id.slice(0, -1)}3`, project, requests)?.label).toBe(
      '00000000',
    );
    expect(releaseRequestSubpage(`${list}/${id}`, project)?.label).toBe('00000000');
    expect(releaseRequestSubpage(`${list}/other-rr-9`, project)?.label).toBe('other-rr-9');
  });

  it('has no crumb for the list itself or for other pages', () => {
    expect(releaseRequestSubpage(list, project)).toBeUndefined();
    expect(releaseRequestSubpage(`${list}/`, project)).toBeUndefined();
    expect(releaseRequestSubpage(`${project}/work/detail/${id}`, project)).toBeUndefined();
  });
});
