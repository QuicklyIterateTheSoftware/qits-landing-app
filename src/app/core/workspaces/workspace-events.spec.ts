import type { DomainEvent } from '$core/events/domain-events';
import { payloadIds } from '$core/events/refresh-on';
import {
  ACTIVE_AGENT_EVENTS,
  AGENT_STATUS_EVENTS,
  concerns,
  WORKSPACE_EVENTS,
  workspaceEventIds,
} from './workspace-events';

const event = (name: string, payload: object | string | undefined): DomainEvent => ({
  name,
  payload: typeof payload === 'string' || payload === undefined ? payload : JSON.stringify(payload),
});

describe('workspace lifecycle events', () => {
  const placed = event('AgentPlaced', {
    agentId: 'a1',
    workId: 'w1',
    workspaceId: '12',
    repositoryId: 'r1',
  });

  it('reads the ids a payload names, flat and as strings', () => {
    expect(workspaceEventIds(placed)).toEqual({
      agentId: 'a1',
      workId: 'w1',
      workspaceId: '12',
      repositoryId: 'r1',
    });
    expect(workspaceEventIds(event('WorkspaceStarted', { workspaceId: 12 })).workspaceId).toBe(
      '12',
    );
    expect(workspaceEventIds(event('AgentRequeued', 'not json'))).toEqual({});
    expect(workspaceEventIds(event('AgentRequeued', undefined))).toEqual({});
  });

  it('concerns a page when it names one of the page’s ids', () => {
    expect(concerns(placed, { repositoryId: 'r1' })).toBe(true);
    expect(concerns(placed, { workspaceId: '12' })).toBe(true);
    expect(concerns(placed, { agentId: 'a1' })).toBe(true);
    expect(concerns(placed, { workId: 'w1' })).toBe(true);
    expect(concerns(placed, { repositoryId: 'r2', workspaceId: '13' })).toBe(false);
    expect(concerns(placed, {})).toBe(false);
    // Several scopes: any id of any of them.
    expect(concerns(placed, [{ repositoryId: 'r2' }, { agentId: 'a1' }])).toBe(true);
    expect(concerns(placed, [{ repositoryId: 'r2' }, { agentId: 'a2' }])).toBe(false);
    expect(concerns(placed, [])).toBe(false);
    // A queued agent's events name no slot: an unknown slot never matches a missing one.
    expect(concerns(event('AgentRequeued', { agentId: 'a2' }), { workspaceId: undefined })).toBe(
      false,
    );
  });

  it('names an agent’s status events, and the ACTIVE agents’ moves, as its status', () => {
    const status = [
      'AgentWaitOpened',
      'AgentWaitChanged',
      'AgentWaitClosed',
      'AgentActivityChanged',
      'AgentAttentionChanged',
      'AgentNudged',
    ];
    expect([...AGENT_STATUS_EVENTS]).toEqual([...status, ...ACTIVE_AGENT_EVENTS]);
    expect(status.every((name) => (WORKSPACE_EVENTS as readonly string[]).includes(name))).toBe(
      true,
    );
  });

  it('reads the project a status event names', () => {
    const opened = event('AgentWaitOpened', {
      agentId: 'a1',
      workId: 'w1',
      workspaceId: '12',
      repositoryId: 'r1',
      projectId: 'p1',
      waitId: 'wait-1',
      subjectKind: 'RELEASE_REQUEST',
    });
    expect(payloadIds(opened).projectId).toBe('p1');
    expect(payloadIds(opened).agentId).toBe('a1');
    expect(concerns(opened, { agentId: 'a1' })).toBe(true);
  });
});
