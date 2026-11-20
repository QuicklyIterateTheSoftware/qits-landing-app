import { shortSwarmId, swarmNodeAvailabilityTone, swarmNodeStatusTone } from './swarm-node-tones';

describe('swarmNodeStatusTone (qits-2346)', () => {
  it.each([
    ['Ready', 'ok'],
    ['ready', 'ok'],
    ['Down', 'failed'],
    ['DOWN', 'failed'],
    ['Unknown', 'waiting'],
    ['Disconnected', 'waiting'],
    ['disconnected', 'waiting'],
    ['Rebooting', 'neutral'],
    ['', 'neutral'],
    [undefined, 'neutral'],
  ])('reads %j as %s', (status, tone) => {
    expect(swarmNodeStatusTone(status)).toBe(tone);
  });
});

describe('swarmNodeAvailabilityTone (qits-2346)', () => {
  it.each([
    ['Active', 'ok'],
    ['active', 'ok'],
    ['Pause', 'waiting'],
    ['PAUSE', 'waiting'],
    ['Drain', 'neutral'],
    ['drain', 'neutral'],
    ['Retired', 'neutral'],
    ['', 'neutral'],
    [undefined, 'neutral'],
  ])('reads %j as %s', (availability, tone) => {
    expect(swarmNodeAvailabilityTone(availability)).toBe(tone);
  });
});

describe('shortSwarmId (qits-2346)', () => {
  it('keeps docker’s 12 characters of an id', () => {
    expect(shortSwarmId('iwbwrdui2z0n62kqcjfo1erwh')).toBe('iwbwrdui2z0n');
  });

  it('keeps a shorter id whole', () => {
    expect(shortSwarmId('abc')).toBe('abc');
  });

  it.each(['', undefined])('draws %j as a dash', (id) => {
    expect(shortSwarmId(id)).toBe('—');
  });
});
