import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getAgentWorktree, listCommands } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { GET_AGENT_WORKTREE, LIST_COMMANDS } from './agent-harness.consumes';
import type { ReadStatus } from './agents.store';

/**
 * How an agent's harness runs:
 *
 * - `terminal`: in a terminal (a PTY); `commandId` is the command the Terminal tab's socket attaches
 *   to, and whose transcript the Chat tab reads.
 * - `chat`: as a chat (line-delimited JSON on pipes); `commandId` is the command the Chat tab's
 *   socket attaches to.
 * - `none`: the daemon knows no harness command (it has not started the agent since it came up, or
 *   the command is gone from its list).
 */
export type HarnessKind = 'terminal' | 'chat' | 'none';

/**
 * One agent's harness, as `load` left it. `missing`: the daemon holds no worktree for the agent.
 * `running`: the command still runs; a stopped one keeps its kind and id, for its transcript.
 */
export interface AgentHarness {
  readonly status: ReadStatus;
  readonly kind: HarnessKind;
  readonly commandId: string | null;
  readonly running: boolean;
}

interface AgentTerminalState {
  /** By `<slot row id>/<agent id>`. */
  readonly harnesses: Readonly<Record<string, AgentHarness>>;
}

/** Where qits-workspaces proxies to one slot's daemon: the daemon's paths go below it verbatim. */
export const CONTAINER_PREFIX = '/workspaces/container';

/** The daemon's own base, `<qits-workspaces' origin>/workspaces/container/<slot row id>`. */
export function containerBase(origin: string, workspaceRowId: number): string {
  return `${origin}${CONTAINER_PREFIX}/${encodeURIComponent(workspaceRowId)}`;
}

const key = (workspaceRowId: number, agentId: string) => `${workspaceRowId}/${agentId}`;

/**
 * An agent's harness, read from its slot's daemon through qits-workspaces' container proxy (epic
 * qits-1230), for the agent's Terminal and Chat tabs: which command the terminal or the chat
 * attaches to, and whether it still runs.
 *
 * `load(workspaceRowId, agentId)` reads the agent's worktree (`getAgentWorktree`: its harness's
 * last command), then, when it names one, the container's commands (`listCommands`: whether that
 * command runs, as a terminal or a chat), as qits-workspaces-frontend's Terminal tab did. Each call reads again,
 * keeping the last good answer when a read again fails.
 *
 * The daemon's paths are its own (`/commands`); every call gets the container's base as its
 * `baseUrl`, at qits-workspaces' origin (`PlatformOrigins.api('workspaces')`).
 */
export const AgentHarnessStore = signalStore(
  { providedIn: 'root' },
  withState<AgentTerminalState>({ harnesses: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);
    const set = (id: string, value: AgentHarness) =>
      patchState(store, { harnesses: { ...store.harnesses(), [id]: value } });

    return {
      async load(workspaceRowId: number, agentId: string): Promise<void> {
        if (!Number.isInteger(workspaceRowId) || workspaceRowId <= 0 || !agentId) return;
        const id = key(workspaceRowId, agentId);
        const none = { kind: 'none', commandId: null, running: false } as const;
        if (!store.harnesses()[id]) set(id, { status: 'loading', ...none });
        const baseUrl = containerBase(origins.api('workspaces'), workspaceRowId);
        const failed = () => {
          if (store.harnesses()[id]?.status !== 'loaded') {
            set(id, { status: 'error', ...none });
          }
        };
        const worktree = await consume(
          getAgentWorktree({ baseUrl, path: { agentId } }),
          GET_AGENT_WORKTREE,
        );
        if (worktree.response?.status === 404) {
          set(id, { status: 'missing', ...none });
          return;
        }
        if (worktree.error !== undefined) return failed();
        const commandId = worktree.data?.commandId ?? null;
        if (!commandId) {
          set(id, { status: 'loaded', ...none });
          return;
        }
        const commands = await consume(listCommands({ baseUrl }), LIST_COMMANDS);
        if (commands.error !== undefined || !commands.data) return failed();
        const command = commands.data.entries.find(
          (entry) => entry.command.id === commandId,
        )?.command;
        if (!command) {
          set(id, { status: 'loaded', ...none });
          return;
        }
        set(id, {
          status: 'loaded',
          kind: command.kind === 'TERMINAL' ? 'terminal' : 'chat',
          commandId: command.id,
          running: command.status === 'RUNNING',
        });
      },
      harnessOf(workspaceRowId: number, agentId: string): AgentHarness | undefined {
        return store.harnesses()[key(workspaceRowId, agentId)];
      },
    };
  }),
);
