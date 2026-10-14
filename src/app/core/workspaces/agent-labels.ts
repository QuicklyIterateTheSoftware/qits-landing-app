/**
 * How an agent and its slot read, as words: ported from qits-workspaces-frontend's
 * `detail/agent-labels.ts`, `ui/format.ts` and `detail/status-strip.ts` (epic qits-1230), so the
 * landing app's workspace pages say what the old pages said. Pure functions over the fields the
 * stores read; every one takes the clock as an argument, so a spec pins it.
 */

/** What is drawn where there is nothing to draw. */
export const NONE = '—';

/** The run states and activities qits-workspaces answers, as plain strings. */
interface RunStated {
  readonly runState?: string | null;
}

interface Waiting {
  readonly waitingOn?: string | null;
  readonly waitingOnSince?: string | null;
}

/**
 * How long ago an instant was, in the coarsest unit that is still true: `4m ago`, `2h ago`, `3d
 * ago`, and `just now` under a minute. An unparseable instant is {@link NONE}.
 */
export function relativeSince(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return NONE;
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** How an agent's run state reads: whether it holds its slot's one harness, yielded it, or waits. */
export function runStateLabel(agent: RunStated): string {
  switch (agent.runState) {
    case 'RUNNING':
      return 'running';
    case 'YIELDED':
      return 'yielded — idle, terminal stays live';
    case 'QUEUED':
      return 'queued — no free slot yet';
    default:
      return String(agent.runState ?? 'unknown').toLowerCase();
  }
}

/**
 * What the agent waits on, from its open declared waits (qits-1229): `waiting on <labels> · 4m ago`.
 * The age is `waitingOnSince`'s, the oldest open wait's creation, and is left out when the service
 * does not send it. Null when the agent declares no wait. A declared wait is on a release request,
 * a CI run or a work item, never on a person: this line never says "you".
 */
export function agentWaitLabel(agent: Waiting, now?: Date): string | null {
  const on = agent.waitingOn?.trim();
  if (!on) return null;
  return agent.waitingOnSince
    ? `waiting on ${on} · ${relativeSince(agent.waitingOnSince, now)}`
    : `waiting on ${on}`;
}

/**
 * What the agent is doing, from its daemon's hooks; null when nothing is reported. WAITING is
 * "waiting on you" only when the agent declared no wait: one that waits on a release request, a CI
 * run or a work item is not waiting on a person, and {@link agentWaitLabel} says what it waits on.
 */
export function activityLabel(
  activity: string | null | undefined,
  waitingOn?: string | null,
): string | null {
  switch (activity) {
    case 'BUSY':
      return 'working';
    case 'WAITING':
      return waitingOn?.trim() ? null : 'waiting on you';
    case 'IDLE':
      return 'idle';
    case 'ENDED':
      return 'ended';
    default:
      return null;
  }
}

/** Whether a person is awaited: the agent waits for input and declared no wait of its own. */
export function waitsOnYou(agent: { readonly activity?: string | null } & Waiting): boolean {
  return activityLabel(agent.activity, agent.waitingOn) === 'waiting on you';
}

/** What an agent is called on screen: its work item's qualified id, else its id. */
export function agentName(agent: {
  readonly entityId?: string | null;
  readonly agentId?: string;
}): string {
  return agent.entityId?.trim() || agent.agentId || '';
}

/** A slot's runtime status, lower case; `runtime unknown` when none is reported. */
export function runtimeLabel(runtimeStatus: string | null | undefined): string {
  return runtimeStatus?.toLowerCase() ?? 'runtime unknown';
}

/** What a slot's placement fields hold. */
export interface Placed {
  readonly placement?: string | null;
  readonly runtimeStatus?: string | null;
  readonly runner?: { readonly name?: string | null } | null;
  readonly queuedAt?: string | null;
  readonly daemonConnectedAt?: string | null;
}

/** The runner a slot is placed on, by name; null for a DIRECT slot and one no runner took yet. */
export function runnerName(slot: Placed): string | null {
  return slot.placement === 'RUNNER' ? (slot.runner?.name ?? null) : null;
}

/**
 * Where a slot stands and why, as one sentence: on which runner, waiting for a slot on it (and
 * since when), or offline; "on the platform host" for a DIRECT slot.
 */
export function placementNote(slot: Placed, now?: Date): string {
  if (slot.placement !== 'RUNNER') return 'on the platform host';
  const runner = runnerName(slot);
  switch (slot.runtimeStatus) {
    case 'QUEUED': {
      const since = slot.queuedAt ? ` since ${relativeSince(slot.queuedAt, now)}` : '';
      return runner ? `waiting for a slot on ${runner}${since}` : `waiting for a runner${since}`;
    }
    case 'UNAVAILABLE': {
      const base = runner ? `runner ${runner} is offline` : 'its runner is offline';
      return slot.daemonConnectedAt ? `${base} — the session is still up` : base;
    }
    default:
      return runner ? `on runner ${runner}` : 'placed on a runner';
  }
}

/** What can be said about a slot's in-container daemon. */
export type DaemonState = 'connected' | 'gone' | 'not-running';

/**
 * The daemon, from the slot alone: connected while the container runs and the daemon reported in;
 * gone when it should be up and is not; not running when there is no container to hold one. An
 * UNAVAILABLE slot with a live daemon reads like a RUNNING one: its control socket rides the edge,
 * not the runner.
 */
export function daemonState(slot: Placed): DaemonState {
  const live =
    slot.runtimeStatus === 'RUNNING' ||
    (slot.runtimeStatus === 'UNAVAILABLE' && !!slot.daemonConnectedAt);
  if (!live) return 'not-running';
  return slot.daemonConnectedAt ? 'connected' : 'gone';
}
