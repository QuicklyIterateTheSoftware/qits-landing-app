import type { GetAgentWorktreeResponses, ListCommandsResponses } from '../../api/workspace-daemon';
import type { Consumed } from '@qits/angular';

/**
 * What `AgentHarnessStore` reads from qits-workspace-daemon's answers, through qits-workspaces'
 * container proxy (epic qits-1230). The store passes each list to `consume(...)`, so it cannot read
 * any other field, and its pact spec passes the same lists as `consumes`. To read another field,
 * add it here.
 */

/**
 * `AgentHarnessStore.load(workspaceRowId, agentId)`: the agent's worktree (`getAgentWorktree`),
 * for the harness's last command, the one the terminal socket attaches to. A 404 (the daemon has
 * not started the agent since it came up) binds the status only.
 */
export const GET_AGENT_WORKTREE = ['commandId'] as const;

/** The agent's worktree, cut to what the store reads. */
export type AgentWorktree = Consumed<GetAgentWorktreeResponses[200], typeof GET_AGENT_WORKTREE>;

/**
 * `AgentHarnessStore.load(workspaceRowId, agentId)`: the container's commands (`listCommands`),
 * for whether the harness's command still runs, and as a terminal or as a chat.
 */
export const LIST_COMMANDS = [
  'entries[].command.id',
  'entries[].command.status',
  'entries[].command.kind',
] as const;

/** One command of the list, cut to what the store reads. */
export type ContainerCommand = NonNullable<
  Consumed<ListCommandsResponses[200], typeof LIST_COMMANDS>['entries'][number]['command']
>;
