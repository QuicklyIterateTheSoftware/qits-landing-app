import {
  activityLabel,
  agentName,
  agentWaitLabel,
  daemonState,
  itemDoneLabel,
  NONE,
  placementNote,
  relativeSince,
  runStateLabel,
  runtimeLabel,
  waitsOnYou,
} from './agent-labels';

const NOW = new Date('2026-01-01T12:00:00Z');

describe('agent labels', () => {
  it('reads an instant coarsely, relative to now', () => {
    expect(relativeSince('2026-01-01T11:59:30Z', NOW)).toBe('just now');
    expect(relativeSince('2026-01-01T11:56:00Z', NOW)).toBe('4m ago');
    expect(relativeSince('2026-01-01T10:00:00Z', NOW)).toBe('2h ago');
    expect(relativeSince('2025-12-29T12:00:00Z', NOW)).toBe('3d ago');
    expect(relativeSince('2026-01-01T13:00:00Z', NOW)).toBe('just now');
    expect(relativeSince('not a date', NOW)).toBe(NONE);
  });

  it('says how an agent runs', () => {
    expect(runStateLabel({ runState: 'RUNNING' })).toBe('running');
    expect(runStateLabel({ runState: 'YIELDED' })).toBe('yielded — idle, terminal stays live');
    expect(runStateLabel({ runState: 'QUEUED' })).toBe('queued — no free slot yet');
    expect(runStateLabel({ runState: 'STOPPED' })).toBe(
      'stopped — by a person; starts again when restarted or prompted',
    );
    expect(runStateLabel({ runState: 'SOMETHING_NEW' })).toBe('something_new');
    expect(runStateLabel({})).toBe('unknown');
  });

  it('names what a declared wait waits on, and since when (qits-1229)', () => {
    expect(
      agentWaitLabel(
        { waitingOn: 'release-request rr-1', waitingOnSince: '2026-01-01T11:56:00Z' },
        NOW,
      ),
    ).toBe('waiting on release-request rr-1 · 4m ago');
    expect(agentWaitLabel({ waitingOn: 'ci-run 7' }, NOW)).toBe('waiting on ci-run 7');
    expect(agentWaitLabel({ waitingOn: '  ' }, NOW)).toBeNull();
    expect(agentWaitLabel({}, NOW)).toBeNull();
  });

  it('calls a waiting agent "waiting on you" only when it declared no wait', () => {
    expect(activityLabel('WAITING')).toBe('waiting on you');
    expect(activityLabel('WAITING', 'release-request rr-1')).toBeNull();
    expect(activityLabel('BUSY', 'work item qits-1')).toBe('working');
    expect(activityLabel('IDLE')).toBe('idle');
    expect(activityLabel('ENDED')).toBe('ended');
    expect(activityLabel(null)).toBeNull();
    expect(waitsOnYou({ activity: 'WAITING' })).toBe(true);
    expect(waitsOnYou({ activity: 'WAITING', waitingOn: 'ci-run 7' })).toBe(false);
    expect(waitsOnYou({ activity: 'BUSY' })).toBe(false);
  });

  it('calls a finished item done, awaiting acceptance while VERIFIED and done once DONE (qits-1776)', () => {
    expect(itemDoneLabel('VERIFIED')).toBe('done, awaiting acceptance');
    expect(itemDoneLabel('verified')).toBe('done, awaiting acceptance');
    expect(itemDoneLabel('DONE')).toBe('done');
    expect(itemDoneLabel('Done')).toBe('done');
    expect(itemDoneLabel('IMPLEMENTING')).toBeNull();
    expect(itemDoneLabel(null)).toBeNull();
    expect(itemDoneLabel(undefined)).toBeNull();
  });

  it('says an idle or waiting agent on a VERIFIED or DONE item is done, never idle or waiting on you (qits-1776)', () => {
    expect(activityLabel('IDLE', null, 'VERIFIED')).toBe('done, awaiting acceptance');
    expect(activityLabel('WAITING', null, 'VERIFIED')).toBe('done, awaiting acceptance');
    expect(activityLabel('WAITING', 'ci-run 7', 'VERIFIED')).toBe('done, awaiting acceptance');
    expect(activityLabel(null, null, 'VERIFIED')).toBe('done, awaiting acceptance');
    expect(activityLabel('IDLE', null, 'DONE')).toBe('done');
    expect(activityLabel('IDLE', null, 'IMPLEMENTING')).toBe('idle');
    expect(activityLabel('WAITING', null, 'IMPLEMENTING')).toBe('waiting on you');
  });

  it('keeps a working agent on a VERIFIED item working, and an ended one ended (qits-1776)', () => {
    expect(activityLabel('BUSY', null, 'VERIFIED')).toBe('working');
    expect(activityLabel('BUSY', null, 'DONE')).toBe('working');
    expect(activityLabel('ENDED', null, 'VERIFIED')).toBe('ended');
  });

  it('does not wait on you for an agent whose item is VERIFIED or DONE (qits-1776)', () => {
    expect(waitsOnYou({ activity: 'WAITING', entityStatus: 'VERIFIED' })).toBe(false);
    expect(waitsOnYou({ activity: 'WAITING', entityStatus: 'DONE' })).toBe(false);
    expect(waitsOnYou({ activity: 'WAITING', entityStatus: 'IMPLEMENTING' })).toBe(true);
  });

  it('names an agent by its item, else by its id', () => {
    expect(agentName({ entityId: 'qits-617', agentId: 'a1' })).toBe('qits-617');
    expect(agentName({ entityId: ' ', agentId: 'a1' })).toBe('a1');
  });

  it('says where a slot is placed, with no runner name (qits-1481)', () => {
    expect(runtimeLabel('RUNNING')).toBe('running');
    expect(runtimeLabel(undefined)).toBe('runtime unknown');
    expect(placementNote({ placement: 'DIRECT' })).toBe('on the platform host');
    expect(placementNote({ placement: 'RUNNER', runtimeStatus: 'RUNNING' })).toBe(
      'placed on a runner',
    );
    expect(placementNote({ placement: 'RUNNER', runtimeStatus: 'STOPPED' })).toBe(
      'placed on a runner',
    );
    expect(
      placementNote(
        { placement: 'RUNNER', runtimeStatus: 'QUEUED', queuedAt: '2026-01-01T10:00:00Z' },
        NOW,
      ),
    ).toBe('waiting for a runner since 2h ago');
    expect(placementNote({ placement: 'RUNNER', runtimeStatus: 'QUEUED' }, NOW)).toBe(
      'waiting for a runner',
    );
    expect(placementNote({ placement: 'RUNNER', runtimeStatus: 'UNAVAILABLE' })).toBe(
      'its runner is offline',
    );
    expect(
      placementNote({
        placement: 'RUNNER',
        runtimeStatus: 'UNAVAILABLE',
        daemonConnectedAt: '2026-01-01T10:00:00Z',
      }),
    ).toBe('its runner is offline — the session is still up');
    // `TARGET` is qits-system's rename of the placement; both read the same until it ships.
    expect(placementNote({ placement: 'TARGET', runtimeStatus: 'RUNNING' })).toBe(
      'placed on a runner',
    );
  });

  it('reads the daemon off the slot', () => {
    const at = '2026-01-01T10:00:00Z';
    expect(daemonState({ runtimeStatus: 'RUNNING', daemonConnectedAt: at })).toBe('connected');
    expect(daemonState({ runtimeStatus: 'RUNNING' })).toBe('gone');
    expect(daemonState({ runtimeStatus: 'UNAVAILABLE', daemonConnectedAt: at })).toBe('connected');
    expect(daemonState({ runtimeStatus: 'UNAVAILABLE' })).toBe('not-running');
    expect(daemonState({ runtimeStatus: 'PROVISIONING' })).toBe('not-running');
  });
});
