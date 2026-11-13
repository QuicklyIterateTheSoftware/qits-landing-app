import type { AgentType } from '../../api/workspace-daemon';
import type { HarnessSignIn } from './agent-sign-in.consumes';

/** A harness nobody signed in on the shared credential volume, and what to say about it. */
export interface SignedOut {
  readonly harness: AgentType;
  /** The sentence, with the daemon's own hint on where to sign in when it gave one. */
  readonly message: string;
}

/**
 * Which harness to report as signed out: the agent's own when it is known, else any. Read off the
 * daemon's harness report (`capabilities[].authenticated`, `AVAILABLE_AGENTS`); it is a display
 * value and never a gate, since the service asks again at every start.
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
