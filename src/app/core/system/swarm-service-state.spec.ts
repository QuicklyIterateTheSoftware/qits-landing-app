import { swarmServiceState } from './swarm-service-state';

describe('swarmServiceState (qits-2344)', () => {
  it.each([
    ['1/1', 'Running', 'ok'],
    ['3/3', 'Running', 'ok'],
    ['2/2 (max 1 per node)', 'Running', 'ok'],
    ['1/3', 'Degraded', 'waiting'],
    ['1/2 (max 1 per node)', 'Degraded', 'waiting'],
    ['0/1', 'Down', 'failed'],
    ['0/0', 'Stopped', 'neutral'],
    ['global', '—', 'neutral'],
    ['', '—', 'neutral'],
    [undefined, '—', 'neutral'],
    ['3/2', '—', 'neutral'],
    ['1 / 1', '—', 'neutral'],
  ])('reads %j as %s (%s)', (replicas, label, tone) => {
    expect(swarmServiceState(replicas)).toEqual({ label, tone });
  });
});
