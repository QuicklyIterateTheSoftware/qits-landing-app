import { dockerInstant } from './docker-date';

describe('dockerInstant (qits-2352)', () => {
  it.each([
    // Docker's Go layout on a UTC daemon, as the live door prints it.
    ['2026-11-20 21:56:36 +0000 UTC', '2026-11-20T21:56:36.000Z'],
    // The golden master's daemon zone: the abbreviation no parser knows, the offset deciding.
    ['2026-09-11 13:20:36 +0200 CEST', '2026-09-11T11:20:36.000Z'],
    ['2026-01-05 07:00:00 -0500 EST', '2026-01-05T12:00:00.000Z'],
    // Fractional seconds, as docker prints them for images and volumes.
    ['2026-09-11 11:20:36.38 +0000 UTC', '2026-09-11T11:20:36.380Z'],
    ['2026-09-11 11:20:36.123456789 +0000 UTC', '2026-09-11T11:20:36.123Z'],
    // An offset that moves the date across midnight.
    ['2026-03-01 01:30:00 +0200 EET', '2026-02-28T23:30:00.000Z'],
    // ISO-8601, should a door answer it.
    ['2026-11-20T21:56:36Z', '2026-11-20T21:56:36.000Z'],
    ['2026-11-20T21:56:36.5+02:00', '2026-11-20T19:56:36.500Z'],
  ])('reads %j as %s', (docker, iso) => {
    expect(dockerInstant(docker)).toBe(iso);
  });

  it.each([
    [''],
    ['   '],
    [null],
    [undefined],
    ['garbage'],
    ['2 hours ago'],
    // No zone at all: whose 21:56 it is cannot be told.
    ['2026-11-20 21:56:36'],
    // A zone abbreviation alone, which no rule here reads.
    ['2026-11-20 21:56:36 CEST'],
    // Out of range: what `new Date()` would roll over into another day.
    ['2026-02-30 10:00:00 +0000 UTC'],
    ['2026-13-01 10:00:00 +0000 UTC'],
    ['2026-11-20 24:00:00 +0000 UTC'],
  ])('reads %j as no instant', (docker) => {
    expect(dockerInstant(docker)).toBeUndefined();
  });
});
