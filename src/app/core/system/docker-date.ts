/**
 * Docker's dates, read without `new Date()`'s leniency (qits-2352, shared with the node's other
 * resource tabs).
 *
 * `docker ps --format json` (and `docker images`, `docker volume ls`, …) prints Go's default time
 * layout, `2026-11-20 21:56:36 +0000 UTC`, sometimes with fractional seconds
 * (`2026-09-11 11:20:36.38 +0000 UTC`) and with the daemon's zone abbreviation (`+0200 CEST`).
 * Only V8 accepts that string, and nothing accepts it with `CEST`; so it is parsed here by its
 * shape, the numeric offset deciding the instant and the abbreviation ignored. An ISO-8601 instant
 * (`2026-11-20T21:56:36Z`, `…+02:00`) is read the same way, so a door that one day answers ISO keeps
 * working.
 */

/**
 * Date, time, optional fraction, then the zone: a numeric offset (`+0200`, `+02:00`) optionally
 * followed by docker's abbreviation (`CEST`, `UTC`), or ISO's `Z`.
 */
const DOCKER_DATE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(?:(Z)|([+-])(\d{2}):?(\d{2})(?:\s+[A-Za-z]{1,6})?)$/;

/**
 * The instant docker's `s` names, as an ISO-8601 string in UTC (`2026-11-20T21:56:36.000Z`), for
 * `formatInstant` and `formatRelativeTime`; undefined when `s` is empty or not a date of that
 * shape (an out-of-range field included: `2026-02-30` is no date).
 */
export function dockerInstant(s: string | null | undefined): string | undefined {
  const match = DOCKER_DATE.exec((s ?? '').trim());
  if (!match) return undefined;
  const [, y, mo, d, h, mi, sec, fraction, zulu, sign, offH, offM] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hours = Number(h);
  const minutes = Number(mi);
  const seconds = Number(sec);
  const millis = fraction ? Number(fraction.padEnd(3, '0').slice(0, 3)) : 0;
  if (month < 1 || month > 12 || hours > 23 || minutes > 59 || seconds > 59) return undefined;
  if (day < 1 || day > daysIn(year, month)) return undefined;
  const offset = zulu ? 0 : (sign === '-' ? -1 : 1) * (Number(offH) * 60 + Number(offM));
  if (!zulu && (Number(offH) > 23 || Number(offM) > 59)) return undefined;
  const local = Date.UTC(year, month - 1, day, hours, minutes, seconds, millis);
  return new Date(local - offset * 60_000).toISOString();
}

/** The days of `month` (1–12) in `year`, leap years counted. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
