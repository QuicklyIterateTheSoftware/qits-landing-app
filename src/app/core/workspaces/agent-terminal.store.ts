import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { getAgentWorktree, listCommands } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { GET_AGENT_WORKTREE, LIST_COMMANDS } from './agent-terminal.consumes';
import type { ReadStatus } from './agents.store';

/**
 * What an agent's Terminal tab can show:
 *
 * - `terminal`: the harness runs in a terminal; `commandId` is the command its socket attaches to.
 * - `chat`: the harness runs as a chat, so there is no terminal.
 * - `none`: no harness runs (it exited, or the daemon has not started it since it came up).
 */
export type HarnessKind = 'terminal' | 'chat' | 'none';

/** One agent's harness, as `load` left it. `missing`: the daemon holds no worktree for the agent. */
export interface AgentHarness {
  readonly status: ReadStatus;
  readonly kind: HarnessKind;
  readonly commandId: string | null;
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
 * qits-1230), for the agent's Terminal tab: which command the terminal attaches to.
 *
 * `load(workspaceRowId, agentId)` reads the agent's worktree (`getAgentWorktree`: its harness's
 * last command), then, when it names one, the container's commands (`listCommands`: whether that
 * command runs, as a terminal or a chat), as qits-workspaces-frontend's Terminal tab did. Each call reads again,
 * keeping the last good answer when a read again fails.
 *
 * The daemon's paths are its own (`/commands`); every call gets the container's base as its
 * `baseUrl`, at qits-workspaces' origin (`PlatformOrigins.api('workspaces')`).
 */
export const AgentTerminalStore = signalStore(
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
        if (!store.harnesses()[id]) set(id, { status: 'loading', kind: 'none', commandId: null });
        const baseUrl = containerBase(origins.api('workspaces'), workspaceRowId);
        const failed = () => {
          if (store.harnesses()[id]?.status !== 'loaded') {
            set(id, { status: 'error', kind: 'none', commandId: null });
          }
        };
        const worktree = await consume(
          getAgentWorktree({ baseUrl, path: { agentId } }),
          GET_AGENT_WORKTREE,
        );
        if (worktree.response?.status === 404) {
          set(id, { status: 'missing', kind: 'none', commandId: null });
          return;
        }
        if (worktree.error !== undefined) return failed();
        const commandId = worktree.data?.commandId ?? null;
        if (!commandId) {
          set(id, { status: 'loaded', kind: 'none', commandId: null });
          return;
        }
        const commands = await consume(listCommands({ baseUrl }), LIST_COMMANDS);
        if (commands.error !== undefined || !commands.data) return failed();
        const command = commands.data.entries.find(
          (entry) => entry.command.id === commandId,
        )?.command;
        if (!command || command.status !== 'RUNNING') {
          set(id, { status: 'loaded', kind: 'none', commandId: null });
          return;
        }
        set(id, {
          status: 'loaded',
          kind: command.kind === 'TERMINAL' ? 'terminal' : 'chat',
          commandId: command.id,
        });
      },
      harnessOf(workspaceRowId: number, agentId: string): AgentHarness | undefined {
        return store.harnesses()[key(workspaceRowId, agentId)];
      },
    };
  }),
);
