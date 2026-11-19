import {
  agentSubpage,
  deploymentRequestSubpage,
  releaseRequestSubpage,
  slotSubpage,
  workSubpage,
} from './shell.layout';

describe('slotSubpage', () => {
  const project = '/projects/qits';

  it('names a workspace slot by its label', () => {
    expect(slotSubpage(`${project}/workspaces/12?x=1`, project)).toEqual({
      label: 'ws-12',
      path: `${project}/workspaces/12`,
    });
  });

  it('is undefined for the list, a literal page below it, and anywhere else', () => {
    expect(slotSubpage(`${project}/workspaces`, project)).toBeUndefined();
    expect(slotSubpage(`${project}/workspaces/`, project)).toBeUndefined();
    expect(slotSubpage(`${project}/workspaces/runners`, project)).toBeUndefined();
    expect(slotSubpage(`${project}/work/detail/qits-111`, project)).toBeUndefined();
    expect(slotSubpage('/projects/other/workspaces/12', project)).toBeUndefined();
  });
});

describe('agentSubpage', () => {
  const project = '/projects/qits';
  const agentId = '00000000-0000-4000-8000-0000000000a1';

  it('names an agent by its item, and its tabs', () => {
    const agents = [{ agentId, entityId: 'qits-111' }];
    expect(agentSubpage(`${project}/agents/${agentId}`, project, agents)).toEqual({
      label: 'qits-111',
      path: `${project}/agents/${agentId}`,
      // The label is the agent's item, from the project's ACTIVE agents (qits-2141).
      marks: {
        source: 'qits-workspaces-service#listAgents',
        item: `agentId=${agentId}`,
        field: 'entityId',
      },
    });
    expect(agentSubpage(`${project}/agents/${agentId}/terminal?x=1`, project, agents)?.path).toBe(
      `${project}/agents/${agentId}`,
    );
  });

  it('names an agent it does not list by its id’s first eight characters', () => {
    const page = agentSubpage(`${project}/agents/${agentId}/chat`, project);
    expect(page?.label).toBe('00000000');
    expect(page?.marks).toBeUndefined();
  });

  it('is undefined for the list itself and anywhere else', () => {
    expect(agentSubpage(`${project}/agents`, project)).toBeUndefined();
    expect(agentSubpage(`${project}/agents/`, project)).toBeUndefined();
    expect(agentSubpage(`${project}/work/detail/qits-111/agent`, project)).toBeUndefined();
    expect(agentSubpage(`${project}/workspaces/12`, project)).toBeUndefined();
  });
});

describe('workSubpage', () => {
  const project = '/projects/qits';
  const work = `${project}/work`;

  it('names each tab', () => {
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
    // The label is the request's logical id, from the project's release requests (qits-2141).
    const marks = {
      source: 'qits-projects-service#listProjectReleaseRequests',
      item: `id=${id}`,
      field: 'qualifiedId',
    };
    expect(releaseRequestSubpage(`${list}/${id}?x=1`, project, requests)).toEqual({
      label: 'contract-service-rr-2',
      path: `${list}/${id}`,
      marks,
    });
    expect(releaseRequestSubpage(`${list}/contract-service-rr-2#x`, project, requests)).toEqual({
      label: 'contract-service-rr-2',
      path: `${list}/contract-service-rr-2`,
      marks,
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

describe('deploymentRequestSubpage', () => {
  const project = '/projects/qits';
  const list = `${project}/deployments/requests`;
  const id = '00000000-0000-4000-8000-000000000002';
  const shown = { id, version: '2026.101.120000', applicationName: 'contract-app' };

  it('names the request on show by its version and application', () => {
    expect(deploymentRequestSubpage(`${list}/${id}?x=1`, project, shown)).toEqual({
      label: '2026.101.120000 · contract-app',
      path: `${list}/${id}`,
      marks: {
        source: 'qits-deployments-service#getDeploymentRequest',
        item: `id=${id}`,
        derived: 'version applicationName',
      },
    });
  });

  it('names a request its page has not shown by the start of its id', () => {
    expect(deploymentRequestSubpage(`${list}/${id}`, project)).toEqual({
      label: '00000000',
      path: `${list}/${id}`,
      marks: undefined,
    });
    expect(deploymentRequestSubpage(`${list}/${id.slice(0, -1)}3`, project, shown)?.label).toBe(
      '00000000',
    );
  });

  it('names one release’s requests by the release’s version', () => {
    expect(
      deploymentRequestSubpage(`${list}/by-release/r%2F1/2026.101.120000?x=1`, project, shown),
    ).toEqual({
      label: 'release 2026.101.120000',
      path: `${list}/by-release/r%2F1/2026.101.120000`,
    });
    expect(deploymentRequestSubpage(`${list}/by-release/r1`, project)).toBeUndefined();
  });

  it('has no crumb for the list itself or for other pages', () => {
    expect(deploymentRequestSubpage(list, project, shown)).toBeUndefined();
    expect(deploymentRequestSubpage(`${list}/`, project, shown)).toBeUndefined();
    expect(deploymentRequestSubpage(`${project}/release-requests/${id}`, project)).toBeUndefined();
  });
});
