import type { ChipTone } from '$ui/components/chip/chip';

/** A swarm service's state, as the services page draws it: a label and its chip's tone. */
export interface SwarmServiceState {
  readonly label: 'Running' | 'Degraded' | 'Down' | 'Stopped' | '—';
  readonly tone: ChipTone;
}

/** What a `replicas` that does not read as `<running>/<desired>` comes to. */
const UNKNOWN: SwarmServiceState = { label: '—', tone: 'neutral' };

/**
 * A swarm service's state (qits-2344), derived from docker's `replicas` string alone, as no read
 * carries one: `running/desired`, with a trailing ` (…)` dropped (docker writes
 * `2/2 (max 1 per node)`).
 *
 * - desired > 0 and running = desired: `Running` (ok);
 * - 0 < running < desired: `Degraded` (waiting);
 * - running = 0 < desired: `Down` (failed);
 * - desired = 0: `Stopped` (neutral), a service scaled to nothing;
 * - anything else (`global`, empty, absent, more running than desired): `—` (neutral).
 */
export function swarmServiceState(replicas: string | undefined): SwarmServiceState {
  const match = /^(\d+)\/(\d+)$/.exec((replicas ?? '').replace(/\s*\(.*\)\s*$/, '').trim());
  if (!match) return UNKNOWN;
  const running = Number(match[1]);
  const desired = Number(match[2]);
  if (desired === 0) return { label: 'Stopped', tone: 'neutral' };
  if (running === desired) return { label: 'Running', tone: 'ok' };
  if (running === 0) return { label: 'Down', tone: 'failed' };
  if (running < desired) return { label: 'Degraded', tone: 'waiting' };
  return UNKNOWN;
}
