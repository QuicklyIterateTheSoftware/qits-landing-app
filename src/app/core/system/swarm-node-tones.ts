import type { ChipTone } from '$ui/components/chip/chip';

/**
 * A swarm node's status as a chip's tone (qits-2346), read case-insensitively off docker's
 * `Status`: `Ready` is ok, `Down` failed, `Unknown` and `Disconnected` waiting (the manager has
 * lost sight of it, which may pass), anything else (absent, a value docker adds later) neutral.
 */
export function swarmNodeStatusTone(status: string | undefined): ChipTone {
  switch (status?.trim().toLowerCase()) {
    case 'ready':
      return 'ok';
    case 'down':
      return 'failed';
    case 'unknown':
    case 'disconnected':
      return 'waiting';
    default:
      return 'neutral';
  }
}

/**
 * A swarm node's availability as a chip's tone (qits-2346), read case-insensitively off docker's
 * `Availability`: `Active` is ok, `Pause` waiting (it keeps its tasks but takes no new ones),
 * `Drain` neutral (emptied on purpose), anything else neutral.
 */
export function swarmNodeAvailabilityTone(availability: string | undefined): ChipTone {
  switch (availability?.trim().toLowerCase()) {
    case 'active':
      return 'ok';
    case 'pause':
      return 'waiting';
    default:
      return 'neutral';
  }
}

/**
 * A docker object's id as docker's own listings print it (qits-2346): its first 12 characters
 * (`docker node ls`' ID column); `—` when there is none.
 */
export function shortSwarmId(id: string | undefined): string {
  return id ? id.slice(0, 12) : '—';
}
