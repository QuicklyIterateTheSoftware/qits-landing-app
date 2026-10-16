import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  createAgent,
  discardAgent,
  ensureWorkspaceContainer,
  recreateWorkspaceContainer,
  stopWorkspaceContainer,
  type AgentHarness as Harness,
} from '../../api/workspaces';
import {
  CREATE_AGENT,
  DISCARD_AGENT,
  ENSURE_CONTAINER,
  RECREATE_CONTAINER,
  REFUSAL,
  REFUSAL_MESSAGE,
  STOP_CONTAINER,
  type CreatedAgent,
  type DiscardedAgent,
  type EnsuredContainer,
  type RecreatedContainer,
  type StoppedContainer,
} from './agent-actions.consumes';

/** A harness an agent can run in (`CLAUDE`, `KIMI`); none sent takes the service's default. */
export type AgentHarnessName = Harness;

/** The harnesses the create form offers, in qits-workspaces' own order. */
export const AGENT_HARNESSES: readonly AgentHarnessName[] = ['CLAUDE', 'KIMI'];

/**
 * Why a write was refused: the HTTP status (0: no answer), and the service's `message` and `code`
 * when its body carried them.
 */
export interface Refusal {
  readonly status: number;
  readonly message?: string;
  readonly code?: string;
}

/** What a write came to: its answer, or its refusal. */
export type ActionOutcome<T> =
  { readonly ok: true; readonly value: T } | ({ readonly ok: false } & Refusal);

/** What the create form sends: the item and how its agent should run. */
export interface NewAgent {
  /** The wrapper repository the agent works in. */
  readonly repositoryId: string;
  /** The item's id (qits-projects' entity id). */
  readonly workId: string;
  /** The item's qualified id (`qits-617`). */
  readonly entityId: string;
  readonly kind: 'TICKET' | 'EPIC';
  /** Admin mode: the agent runs in a slot that holds the host's docker socket. Sent either way. */
  readonly admin: boolean;
  /** Omitted: the service's default harness. */
  readonly harness?: AgentHarnessName;
  /** The agent's first turn; omitted when blank. */
  readonly instruction?: string;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

/**
 * A refusal read off a failed answer. The error's type is the OpenAPI document's (`ApiError` on a
 * 409, nothing on most others), so its fields are checked here rather than trusted.
 */
export function refusalOf(error: unknown, response: { readonly status: number } | undefined) {
  const body =
    error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  return {
    ok: false,
    status: response?.status ?? 0,
    message: text(body['message']),
    code: text(body['code']),
  } as const;
}

/** How a refusal reads in a sentence: `409 <the service's message>`, or what is known. */
export function describeRefusal(refusal: Refusal): string {
  if (refusal.status === 0) return 'the service is unreachable';
  return refusal.message ? `${refusal.status} ${refusal.message}` : `${refusal.status}`;
}

/** `text` ending in a full stop: one added unless it already ends a sentence. */
export function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * The workspace pages' writes on qits-workspaces (epic qits-1230), as qits-workspaces-frontend's
 * overview, workspace and agent pages made them. Each answers an {@link ActionOutcome}; the page
 * reads its data again afterwards, and qits-workspaces' lifecycle events read it again too.
 *
 * - `createAgent`: an agent for a ticket or an epic (`POST /workspaces/api/agents`); an item that
 *   already has an ACTIVE agent answers that one (`fresh: false`).
 * - `discardAgent(agentId, force)`: remove the agent (`…/agents/{id}/discard`). Without `force` the
 *   service refuses (409) an agent whose worktrees hold work that never reached the git host
 *   (`AGENT_HAS_LEFTOVER_WORK`), whose daemon does not answer (`AGENT_DAEMON_UNREACHABLE`) or that
 *   is still busy (`AGENT_BUSY`); the page then offers `force`.
 * - `ensureContainer(id)`, `stopContainer(id)`, `recreateContainer(id)`: a slot's container verbs
 *   (`…/workspaces/{id}/ensure-container|stop-container|recreate-container`). A slot on an offline
 *   runner is refused (409 `RUNNER_UNAVAILABLE`); a recreate needs a working tree the service can
 *   prove clean (400 otherwise).
 *
 * Staleness (qits-1270): holds no platform state; nothing to follow.
 */
export const AgentActionsStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => ({
    async createAgent(agent: NewAgent): Promise<ActionOutcome<CreatedAgent>> {
      const { data, error, response } = await consume(
        createAgent({ body: { ...agent } }),
        CREATE_AGENT,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async discardAgent(agentId: string, force = false): Promise<ActionOutcome<DiscardedAgent>> {
      const { data, error, response } = await consume(
        discardAgent({ path: { id: agentId }, body: { force } }),
        DISCARD_AGENT,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async ensureContainer(id: number): Promise<ActionOutcome<EnsuredContainer>> {
      const { data, error, response } = await consume(
        ensureWorkspaceContainer({ path: { id } }),
        ENSURE_CONTAINER,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async stopContainer(id: number): Promise<ActionOutcome<StoppedContainer>> {
      const { data, error, response } = await consume(
        stopWorkspaceContainer({ path: { id } }),
        STOP_CONTAINER,
        REFUSAL,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
    async recreateContainer(id: number): Promise<ActionOutcome<RecreatedContainer>> {
      const { data, error, response } = await consume(
        recreateWorkspaceContainer({ path: { id } }),
        RECREATE_CONTAINER,
        REFUSAL_MESSAGE,
      );
      if (error !== undefined || !data) return refusalOf(error, response);
      return { ok: true, value: data };
    },
  })),
);
