import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { availableAgents, openSignInTerminal, type AgentType } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { containerBase } from './agent-harness.store';
import {
  AVAILABLE_AGENTS,
  DAEMON_REFUSAL,
  OPEN_SIGN_IN,
  type HarnessSignIn,
} from './agent-sign-in.consumes';
import { describeRefusal, refusalOf, sentence } from './agent-actions.store';

/** A harness nobody signed in on the shared credential volume, and what to say about it. */
export interface SignedOut {
  readonly harness: AgentType;
  /** The sentence, with the daemon's own hint on where to sign in when it gave one. */
  readonly message: string;
}

/**
 * Which harness to report as signed out: the agent's own when it is known, else any. Read off the
 * daemon's harness report (`capabilities[].authenticated`); it is a display value and never a gate,
 * since the service asks again at every start.
 */
export function signedOutHarness(
  capabilities: readonly HarnessSignIn[],
  harness: string | null | undefined,
): SignedOut | null {
  const candidates = harness ? capabilities.filter((c) => c.harness === harness) : capabilities;
  const out = candidates.find((c) => c.authenticated === false);
  if (!out) return null;
  const name = out.harness === 'KIMI' ? 'Kimi Code' : 'Claude Code';
  const detail = out.authDetail?.trim();
  return {
    harness: out.harness,
    message:
      `Nobody has signed ${name} in on the shared credential volume, so the agent cannot start.` +
      (detail ? ` ${detail}` : ''),
  };
}

/** One slot's sign-in, as the store left it. */
export interface SlotSignIn {
  /** How far the harness report got; a failed one shows no notice. */
  readonly status: 'loading' | 'loaded' | 'error';
  /** Each harness's sign-in, from the report. */
  readonly capabilities: readonly HarnessSignIn[];
  /** The sign-in terminal somebody opened, while it is open. */
  readonly commandId: string | null;
  /** Whether the terminal is being opened. */
  readonly opening: boolean;
  /** Why the terminal did not open. */
  readonly problem: string | null;
}

interface SignInState {
  /** By the slot's row id. */
  readonly slots: Readonly<Record<number, SlotSignIn>>;
}

const BLANK: SlotSignIn = {
  status: 'loading',
  capabilities: [],
  commandId: null,
  opening: false,
  problem: null,
};

/**
 * "Nobody is signed in", and the door out of it (epic qits-1230), ported from
 * qits-workspaces-frontend's `AgentSignIn`. One sign-in serves the whole shared credential volume,
 * so it is a fact about the slot's container, not about one agent. Read from the slot's daemon
 * through qits-workspaces' container proxy, at the container's base (`containerBase`).
 *
 * - `loadReport(rowId)`: the daemon's harness report (`availableAgents`); `signedOutHarness`
 *   turns it into the notice. Read again on each call, keeping the last good answer.
 * - `open(rowId, harness)`: start the sign-in terminal (`openSignInTerminal`), once: a second press
 *   keeps the one that is open. The Terminal tab attaches its screen to the command.
 * - `finished(rowId)`: the terminal ended; drop it and read the report again.
 *
 * Staleness (qits-1270): the Terminal tab reads the report again after `WorkspaceStarted` or
 * `AgentStartRefused` naming the slot. A sign-in completed elsewhere (another tab, slot, or the
 * runner's login command) announces nothing on qits-events.
 */
export const AgentSignInStore = signalStore(
  { providedIn: 'root' },
  withState<SignInState>({ slots: {} }),
  withMethods((store) => {
    const origins = inject(PlatformOrigins);
    const base = (rowId: number) => containerBase(origins.api('workspaces'), rowId);
    const of = (rowId: number) => store.slots()[rowId] ?? BLANK;
    const update = (rowId: number, change: Partial<SlotSignIn>) =>
      patchState(store, { slots: { ...store.slots(), [rowId]: { ...of(rowId), ...change } } });

    async function loadReport(rowId: number): Promise<void> {
      if (!Number.isInteger(rowId) || rowId <= 0) return;
      if (!store.slots()[rowId]) update(rowId, {});
      const { data, error } = await consume(
        availableAgents({ baseUrl: base(rowId) }),
        AVAILABLE_AGENTS,
      );
      if (error !== undefined || !data) {
        if (of(rowId).status !== 'loaded') update(rowId, { status: 'error', capabilities: [] });
        return;
      }
      update(rowId, { status: 'loaded', capabilities: data.capabilities ?? [] });
    }

    return {
      loadReport,
      async open(rowId: number, harness?: AgentType): Promise<void> {
        const current = of(rowId);
        if (rowId <= 0 || current.opening || current.commandId) return;
        update(rowId, { opening: true, problem: null });
        const { data, error, response } = await consume(
          openSignInTerminal({
            baseUrl: base(rowId),
            body: harness ? { agentType: harness } : {},
          }),
          OPEN_SIGN_IN,
          DAEMON_REFUSAL,
        );
        if (error !== undefined || !data?.command?.id) {
          update(rowId, {
            opening: false,
            problem: sentence(
              `The sign-in terminal did not open — ${describeRefusal(refusalOf(error, response))}`,
            ),
          });
          return;
        }
        update(rowId, { opening: false, commandId: data.command.id });
      },
      async finished(rowId: number): Promise<void> {
        update(rowId, { commandId: null });
        await loadReport(rowId);
      },
      signInOf(rowId: number): SlotSignIn | undefined {
        return store.slots()[rowId];
      },
    };
  }),
);
