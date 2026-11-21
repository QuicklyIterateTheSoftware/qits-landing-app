import { QitsApiError } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import type { ChipTone } from '$ui/components/chip/chip';

/**
 * What a swarm node's Containers tab (qits-2352) makes of `NODE_CONTAINER_LIST`'s rows: the state
 * filter, the chips' tones, the health shown only while a container runs, and what a refusal says.
 */

/** The shape of a row these helpers read (`NodeContainer`, or any row carrying these fields). */
export interface ContainerRow {
  readonly id?: string;
  readonly state?: string;
  readonly health?: string;
}

/** The tab's state filter: the running containers (the default), the others, or all of them. */
export type ContainerFilter = 'running' | 'stopped' | 'all';

/** The filter's buttons, in the order they show. */
export const CONTAINER_FILTERS: readonly { readonly filter: ContainerFilter; label: string }[] = [
  { filter: 'running', label: 'Running' },
  { filter: 'stopped', label: 'Stopped' },
  { filter: 'all', label: 'All' },
];

/** Running is docker's `state: running`; every other state (exited, created, dead, …) is stopped. */
export function isRunningContainer(row: ContainerRow): boolean {
  return row.state === 'running';
}

/** The rows `filter` lets through, in the server's order. */
export function filteredContainers<T extends ContainerRow>(
  rows: readonly T[],
  filter: ContainerFilter,
): readonly T[] {
  if (filter === 'all') return rows;
  const running = filter === 'running';
  return rows.filter((row) => isRunningContainer(row) === running);
}

/** How many rows each filter lets through, counted from the one `all=true` read. */
export function containerCounts(rows: readonly ContainerRow[]): Record<ContainerFilter, number> {
  const running = rows.filter(isRunningContainer).length;
  return { running, stopped: rows.length - running, all: rows.length };
}

/** The table's caption under `filter`: `2 running containers`, `1 stopped container`, `3 containers`. */
export function containerCaption(filter: ContainerFilter, count: number): string {
  if (filter === 'running') return plural(count, 'running container');
  if (filter === 'stopped') return plural(count, 'stopped container');
  return plural(count, 'container');
}

/** What the tab says when `filter` lets no row through. */
export function noContainersNote(filter: ContainerFilter): string {
  if (filter === 'running') return 'No container is running on this node.';
  if (filter === 'stopped') return 'No stopped containers on this node.';
  return 'This node runs no containers and has none stopped.';
}

/** A container's state chip: running ok; restarting or paused waiting; dead failed; else neutral. */
export function containerStateTone(state: string | undefined): ChipTone {
  switch (state) {
    case 'running':
      return 'ok';
    case 'restarting':
    case 'paused':
      return 'waiting';
    case 'dead':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** A health chip's words and tone. */
export interface ContainerHealth {
  readonly label: string;
  readonly tone: ChipTone;
}

const HEALTH_TONES: Readonly<Record<string, ChipTone>> = {
  healthy: 'ok',
  unhealthy: 'failed',
  starting: 'waiting',
};

/**
 * A container's health, shown only while it runs: docker keeps a dead container's last probe
 * result (live, 89 of 90 exited containers report `unhealthy`), which says nothing once the
 * container stopped. Undefined (the tab draws `—`) for a stopped container and for `none` or no
 * health check.
 */
export function containerHealth(row: ContainerRow): ContainerHealth | undefined {
  if (!isRunningContainer(row)) return undefined;
  const health = row.health ?? '';
  if (!health || health === 'none') return undefined;
  return { label: health, tone: HEALTH_TONES[health] ?? 'neutral' };
}

/** Docker's 12-character short id of a 64-hex container id. */
export function shortContainerId(id: string | undefined): string {
  return (id ?? '').slice(0, 12);
}

/**
 * Why the containers read failed: `remote` for a 409 `NODE_REMOTE` (only the node qits-system runs
 * on can be read), with the service's `message` when the body carried one; else the status.
 */
export interface ContainersFailure {
  readonly status: number | undefined;
  readonly remote: boolean;
  readonly message?: string;
}

/** The failure a containers read threw (its `QitsApiError`, the body narrowed to code and message). */
export function containersFailureOf(error: unknown): ContainersFailure {
  if (!(error instanceof QitsApiError)) return { status: undefined, remote: false };
  const body =
    error.error !== null && typeof error.error === 'object'
      ? (error.error as Record<string, unknown>)
      : {};
  const code = typeof body['code'] === 'string' ? body['code'] : undefined;
  const message =
    typeof body['message'] === 'string' && body['message'].trim() ? body['message'] : undefined;
  return {
    status: error.status,
    remote: error.status === 409 && (code === undefined || code === 'NODE_REMOTE'),
    message,
  };
}
