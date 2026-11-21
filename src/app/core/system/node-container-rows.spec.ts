import { QitsApiError } from '@qits/angular';
import {
  containerCaption,
  containerCounts,
  containerHealth,
  containersFailureOf,
  containerStateTone,
  filteredContainers,
  noContainersNote,
  shortContainerId,
} from './node-container-rows';

const RUNNING = { id: 'a'.repeat(64), state: 'running', health: 'healthy' };
const EXITED = { id: 'b'.repeat(64), state: 'exited', health: 'unhealthy' };
const CREATED = { id: 'c'.repeat(64), state: 'created', health: '' };
const ROWS = [RUNNING, EXITED, CREATED];

const OPERATION = {
  provider: 'qits-system-service',
  operationId: 'listNodeContainers',
  method: 'GET',
} as const;

describe('node container rows (qits-2352)', () => {
  it('filters running and stopped containers, keeping the server’s order', () => {
    expect(filteredContainers(ROWS, 'running')).toEqual([RUNNING]);
    expect(filteredContainers(ROWS, 'stopped')).toEqual([EXITED, CREATED]);
    expect(filteredContainers(ROWS, 'all')).toEqual(ROWS);
  });

  it('counts each filter from the one read', () => {
    expect(containerCounts(ROWS)).toEqual({ running: 1, stopped: 2, all: 3 });
    expect(containerCounts([])).toEqual({ running: 0, stopped: 0, all: 0 });
  });

  it.each([
    ['running', 1, '1 running container'],
    ['running', 31, '31 running containers'],
    ['stopped', 90, '90 stopped containers'],
    ['all', 1, '1 container'],
    ['all', 121, '121 containers'],
  ] as const)('captions %s with %d rows as %j', (filter, count, caption) => {
    expect(containerCaption(filter, count)).toBe(caption);
  });

  it.each([
    ['running', 'No container is running on this node.'],
    ['stopped', 'No stopped containers on this node.'],
    ['all', 'This node runs no containers and has none stopped.'],
  ] as const)('says what an empty %s filter means', (filter, note) => {
    expect(noContainersNote(filter)).toBe(note);
  });

  it.each([
    ['running', 'ok'],
    ['exited', 'neutral'],
    ['created', 'neutral'],
    ['restarting', 'waiting'],
    ['paused', 'waiting'],
    ['dead', 'failed'],
    ['removing', 'neutral'],
    [undefined, 'neutral'],
  ] as const)('tones state %j as %s', (state, tone) => {
    expect(containerStateTone(state)).toBe(tone);
  });

  it('shows health only while a container runs', () => {
    expect(containerHealth(RUNNING)).toEqual({ label: 'healthy', tone: 'ok' });
    expect(containerHealth({ state: 'running', health: 'unhealthy' })).toEqual({
      label: 'unhealthy',
      tone: 'failed',
    });
    expect(containerHealth({ state: 'running', health: 'starting' })).toEqual({
      label: 'starting',
      tone: 'waiting',
    });
    // A dead container's last probe result says nothing about it now.
    expect(containerHealth(EXITED)).toBeUndefined();
    expect(containerHealth({ state: 'running', health: 'none' })).toBeUndefined();
    expect(containerHealth({ state: 'running', health: '' })).toBeUndefined();
  });

  it('shortens a container id to docker’s 12 characters', () => {
    expect(shortContainerId(RUNNING.id)).toBe('aaaaaaaaaaaa');
    expect(shortContainerId(undefined)).toBe('');
  });

  it('reads a 409 NODE_REMOTE as the remote node, with the service’s message', () => {
    const message = 'only the local node is reachable in this version';
    expect(
      containersFailureOf(new QitsApiError(409, { code: 'NODE_REMOTE', message }, OPERATION)),
    ).toEqual({ status: 409, remote: true, message });
    expect(containersFailureOf(new QitsApiError(409, undefined, OPERATION))).toEqual({
      status: 409,
      remote: true,
      message: undefined,
    });
  });

  it('reads any other failure by its status', () => {
    expect(containersFailureOf(new QitsApiError(503, undefined, OPERATION))).toEqual({
      status: 503,
      remote: false,
      message: undefined,
    });
    expect(
      containersFailureOf(new QitsApiError(409, { code: 'SOMETHING_ELSE' }, OPERATION)).remote,
    ).toBe(false);
    expect(containersFailureOf(new Error('network'))).toEqual({
      status: undefined,
      remote: false,
    });
  });
});
