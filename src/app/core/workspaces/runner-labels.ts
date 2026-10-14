import type { Runner } from './runners.consumes';

/**
 * How a workspace runner reads, as words: ported from qits-workspaces-frontend's runners page (epic
 * qits-1230), so the landing app's Runners page says what the old page said. Pure functions over
 * the fields `RunnersStore` reads.
 */

/** How loud a badge is: the same four tones as `ui-chip`'s. */
export type BadgeTone = 'ok' | 'waiting' | 'failed' | 'neutral';

/** A badge: what it says and how loud. */
export interface Badge {
  readonly label: string;
  readonly tone: BadgeTone;
}

/**
 * `[a-z][a-z0-9-]{0,63}`: qits-workspaces' own rule for a runner's name, mirrored so a bad one is
 * caught before the round trip. The service is still the authority.
 */
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** A docker size: digits and an optional `b`/`k`/`m`/`g`. The service also refuses under 6 MiB. */
const DOCKER_SIZE_PATTERN = /^[0-9]{1,15}[bkmgBKMG]?$/;

/** The one swap value with no docker-size shape of its own: unlimited swap. */
const UNLIMITED_SWAP = '-1';

/** The sentence for a quarantined runner the service gave no reason for: a new one. */
const AWAITING_FIRST_HEALTHCHECK = 'awaiting its first health check';

/** Why a typed runner name is refused before the round trip, or `''` when it is not. */
export function nameProblemOf(name: string): string {
  if (!name) return 'A name is required.';
  return NAME_PATTERN.test(name)
    ? ''
    : 'Lowercase letters, digits and hyphens, starting with a letter.';
}

/** Why a slot count is refused, or `''`: 0 or more (0 drains the runner). */
export function slotsProblemOf(slots: number): string {
  return Number.isInteger(slots) && slots >= 0 ? '' : 'Slots must be 0 or more.';
}

/** Why a typed workspace memory limit is refused before the round trip, or `''` when it is not. */
export function memoryLimitProblemOf(value: string): string {
  const limit = value.trim();
  return limit === '' || DOCKER_SIZE_PATTERN.test(limit)
    ? ''
    : 'A docker size: digits and an optional unit b, k, m or g — e.g. 8g or 8192m.';
}

/** A docker size's bytes, so a swap limit can be checked against the memory limit it must cover. */
function bytesOf(size: string): number {
  const match = /^([0-9]{1,15})([bkmgBKMG]?)$/.exec(size);
  if (!match) return NaN;
  const multiplier: Readonly<Record<string, number>> = {
    '': 1,
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
  };
  return Number(match[1]) * (multiplier[match[2].toLowerCase()] ?? NaN);
}

/**
 * Why a typed workspace memory+swap limit is refused, or `''` when it is not: not a docker size
 * and not `-1`; set with no memory limit, since swap is the total of both and the service refuses
 * one without the other; or below the memory limit it has to cover.
 */
export function swapLimitProblemOf(memory: string, swap: string): string {
  const limit = swap.trim();
  if (limit === '') return '';
  if (limit !== UNLIMITED_SWAP && !DOCKER_SIZE_PATTERN.test(limit)) {
    return 'A docker size, or -1 for unlimited swap — e.g. 8g, 8192m or -1.';
  }
  const memoryLimit = memory.trim();
  if (memoryLimit === '') return 'Needs a workspace memory limit too — this is the total of both.';
  if (limit === UNLIMITED_SWAP || !DOCKER_SIZE_PATTERN.test(memoryLimit)) return '';
  return bytesOf(limit) >= bytesOf(memoryLimit)
    ? ''
    : 'Must be at least the workspace memory limit — this is the total of both.';
}

/**
 * Connected now, registered but offline, or never connected at all. Green only for the one that
 * holds a socket: the state a workspace placed on it depends on.
 */
export function connectivityOf(runner: Pick<Runner, 'connected' | 'registered'>): Badge {
  if (runner.connected) return { label: 'connected', tone: 'ok' };
  return runner.registered
    ? { label: 'offline', tone: 'waiting' }
    : { label: 'never connected', tone: 'neutral' };
}

/** How a login presence reads. Absent is a harness the runner has not reported on. */
export function presenceOf(presence: string | null | undefined): Badge {
  switch (presence) {
    case 'PRESENT':
      return { label: 'logged in', tone: 'ok' };
    case 'ABSENT':
      return { label: 'not logged in', tone: 'waiting' };
    case 'UNKNOWN':
      return { label: 'unknown', tone: 'neutral' };
    default:
      return { label: 'not reported', tone: 'neutral' };
  }
}

/**
 * Whether the runner is about to be rolled over: connected, and reporting a version other than the
 * one the service pins. An offline runner is not updating: it is offline.
 */
export function isUpdating(
  runner: Pick<Runner, 'connected' | 'version' | 'pinnedVersion'>,
): boolean {
  return !!runner.connected && runner.version !== runner.pinnedVersion;
}

/** Why the runner is quarantined, in the service's words, or that it waits for its first check. */
export function quarantineReasonOf(runner: Pick<Runner, 'quarantineReason'>): string {
  return runner.quarantineReason || AWAITING_FIRST_HEALTHCHECK;
}

/** What a runner's workspace memory cap says: its own, or the platform's. */
export function memoryOf(runner: Pick<Runner, 'workspaceMemoryLimit'>): string {
  return runner.workspaceMemoryLimit
    ? `${runner.workspaceMemoryLimit} memory`
    : 'platform default memory';
}

/** What a runner's swap cap adds, once it has one: null draws nothing. */
export function swapOf(runner: Pick<Runner, 'workspaceMemorySwapLimit'>): string | null {
  return runner.workspaceMemorySwapLimit ? `${runner.workspaceMemorySwapLimit} swap` : null;
}

/**
 * The badge for a runner's last health check: `health` when the service sends it, else the older
 * `lastHealthCheckOk`; null when it was never checked.
 */
export function healthBadgeOf(runner: Pick<Runner, 'health' | 'lastHealthCheckOk'>): Badge | null {
  const ok = runner.health ? runner.health.ok : runner.lastHealthCheckOk;
  if (ok === null || ok === undefined) return null;
  return ok
    ? { label: 'health check passed', tone: 'ok' }
    : { label: 'health check failed', tone: 'failed' };
}

/** When the badge {@link healthBadgeOf} draws was taken: `health`'s, or the older field. */
export function healthAtOf(runner: Pick<Runner, 'health' | 'lastHealthCheckAt'>): string | null {
  return runner.health?.at ?? runner.lastHealthCheckAt ?? null;
}

/** One check, drawn as a chip plus its detail sentence. */
export interface CheckLine {
  readonly name: string;
  readonly badge: Badge;
  readonly detail: string;
}

/** A check's `ok` as `passed` or `failed`, the overall badge's vocabulary. */
export function checkLineOf(check: {
  readonly name?: string;
  readonly ok?: boolean;
  readonly detail?: string;
}): CheckLine {
  return {
    name: check.name ?? '',
    badge: check.ok ? { label: 'passed', tone: 'ok' } : { label: 'failed', tone: 'failed' },
    detail: check.detail ?? '',
  };
}

/** A flat `key: value` pair of a check's `data`. */
export type DataEntry = readonly [key: string, value: string];

/** A check's `data` as flat entries: nested objects and arrays stringified, not walked further. */
export function dataEntriesOf(data: unknown): readonly DataEntry[] {
  if (data === undefined || data === null) return [];
  if (typeof data !== 'object') return [['value', String(data)]];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => [
    key,
    typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
  ]);
}
