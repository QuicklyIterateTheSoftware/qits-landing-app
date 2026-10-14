import type { Consumed } from '@qits/angular';
import type {
  AvailableAgentsResponses,
  OpenSignInTerminalResponses,
} from '../../api/workspace-daemon';

/**
 * What `AgentSignInStore` reads from qits-workspace-daemon's answers, through qits-workspaces'
 * container proxy (epic qits-1230). The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. To read another field,
 * add it here.
 */

/**
 * `AgentSignInStore.loadReport(workspaceRowId)`: the daemon's harness report
 * (`availableAgents`), for whether anybody signed each harness in on the shared credential volume,
 * and the daemon's own hint when nobody did.
 */
export const AVAILABLE_AGENTS = [
  'capabilities[].harness',
  'capabilities[].authenticated',
  'capabilities[].authDetail',
] as const;

/** The harness report, cut to what the store reads. */
export type HarnessReport = Consumed<AvailableAgentsResponses[200], typeof AVAILABLE_AGENTS>;

/** One harness of the report, cut to what the store reads. */
export type HarnessSignIn = NonNullable<HarnessReport['capabilities']>[number];

/**
 * `AgentSignInStore.open(workspaceRowId)`: the sign-in terminal the daemon started
 * (`openSignInTerminal`), a command the Terminal tab's socket attaches to.
 */
export const OPEN_SIGN_IN = ['command.id'] as const;

/** The sign-in terminal, cut to what the store reads. */
export type SignInTerminal = Consumed<OpenSignInTerminalResponses[200], typeof OPEN_SIGN_IN>;

/** What a daemon refusal says: its own words. */
export const DAEMON_REFUSAL = ['message'] as const;
