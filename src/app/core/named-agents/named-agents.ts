import { payloadOf, type WithPayload } from '$core/events/refresh-on';
import type { NamedAgentEntry, NamedAgentPromptAnswer } from './named-agents.consumes';

/** The UI builder's named agent (qits-2154): one per project, on surface `project.ui-builder`. */
export const UI_BUILDER_AGENT = 'ui-builder';

/**
 * qits-projects' event saying a named agent's computed state moved (qits-2157): its `projectId`,
 * `agentName`, `state`, `commandId` (null while no command runs), `sessionId` and `changedAt`. It is
 * announced for every named agent but the desk, and only when the state or the command changed.
 */
export const NAMED_AGENT_STATE_CHANGED = 'NamedAgentStateChanged';

/** A named agent's state, as qits-projects computes it on read (`NamedAgentHost.list`). */
export type NamedAgentState = NamedAgentEntry['state'];

const STATES: ReadonlySet<string> = new Set(['STOPPED', 'STARTING', 'IDLE', 'BUSY', 'FAILED']);

/** A state in words, as the dialog's chip says it: BUSY is a turn running, so "Working". */
export const NAMED_AGENT_STATE_LABELS: Readonly<Record<NamedAgentState, string>> = {
  STOPPED: 'Stopped',
  STARTING: 'Starting',
  IDLE: 'Idle',
  BUSY: 'Working',
  FAILED: 'Failed',
};

/**
 * A named agent's terminal: the daemon command running it, through qits-projects' container proxy,
 * `WS /projects/container/{projectId}/terminal/commands/{commandId}` on qits-projects' origin
 * (`wss://projects.<domain>/…`; `ws:` when that origin is `http:`). Opening it attaches to the
 * running Claude TUI, and the daemon replays its scrollback; closing only detaches. The wire is
 * `TerminalSocket`'s, signed in with the bearer as a subprotocol (`WEB_SOCKET`), as the backup
 * remote's sign-in terminal (`remoteLoginSocketUrl`).
 */
export function namedAgentTerminalSocketUrl(
  origin: string,
  projectId: string,
  commandId: string,
): string {
  const base = origin.replace(/\/+$/, '').replace(/^http(s?):/, 'ws$1:');
  return `${base}/projects/container/${encodeURIComponent(projectId)}/terminal/commands/${encodeURIComponent(commandId)}`;
}

/** Whether `event` is about the named agents of `projectId` (its payload's `projectId`). */
export function aboutProjectAgents(event: WithPayload, projectId: string | undefined): boolean {
  return !!projectId && payloadOf(event)?.['projectId'] === projectId;
}

/** What a `NamedAgentStateChanged` says of one agent: its state and its command. */
export interface HeardAgentState {
  readonly state: NamedAgentState;
  readonly commandId: string | null;
}

/**
 * What `event` (a `NamedAgentStateChanged`) says of the agent `name` of `projectId`; null when it
 * is about another agent or project, or names no state this app knows.
 */
export function heardAgentState(
  event: WithPayload,
  projectId: string | undefined,
  name: string,
): HeardAgentState | null {
  const payload = payloadOf(event);
  if (!payload || !projectId || payload['projectId'] !== projectId) return null;
  if (payload['agentName'] !== name) return null;
  const state = payload['state'];
  if (typeof state !== 'string' || !STATES.has(state)) return null;
  const commandId = payload['commandId'];
  return {
    state: state as NamedAgentState,
    commandId: typeof commandId === 'string' && commandId ? commandId : null,
  };
}

/**
 * What a prompt's answer says, in one line: delivered; queued behind a running turn (at its
 * position when the daemon gives one); or held while the agent starts (202, state STARTING).
 */
export function promptAnswerLine(answer: NamedAgentPromptAnswer): string {
  if (answer.delivered) return 'Delivered to the agent.';
  if (answer.state === 'STARTING') {
    return 'Starting the agent; your prompt is delivered when it is up.';
  }
  if (typeof answer.position === 'number') {
    return `Queued at position ${answer.position}: the agent takes it after its current turn.`;
  }
  return 'Queued: the agent takes it after its current turn.';
}

/** What each refusal means when the service gives no `reason`. */
const REFUSALS: Readonly<Record<number, string>> = {
  400: 'the prompt is blank',
  404: 'this project has no ui-builder agent',
  409: 'a prompt is already held for the agent',
  429: 'the agent’s prompt queue is full',
  503: 'the agent’s daemon cannot be reached',
};

/**
 * A refused prompt, in one line: its status and the service's `reason` (else what the status
 * means); status 0 is no answer at all.
 */
export function promptRefusalLine(status: number, reason: string | undefined): string {
  if (status === 0) return 'Not sent: the service is unreachable.';
  const why = reason?.trim() || REFUSALS[status] || 'the service refused it';
  return `Not sent (${status}): ${/[.!?]$/.test(why) ? why : `${why}.`}`;
}
