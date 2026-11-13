import { qitsOperation } from '@qits/angular';
import { detect, listFiles, readFile } from '../../api/workspace-daemon';
import { DETECT, LIST_FILES, READ_FILE } from './agent-files.consumes';

/**
 * An agent's worktree on the daemon of the slot it is placed in, through qits-workspaces' agent
 * proxy (`/workspaces/agent/<agent id>/files…`, `/detection`; epic qits-1667), declared as
 * operations (qits-2145) the Files tab reads through `qitsResource` in place of the former
 * `AgentFilesStore` (qits-2146). Each is the daemon's generated call, addressed at the agent's
 * route on qits-workspaces' origin (`agentRoute`, in the params): the service forwards it to the
 * daemon's `agent-worktrees/<agent id>/…`. `agent-files.operations.pact.spec.ts` binds each.
 */

/**
 * One level of the tree (`listFiles`). Without `path` the whole eager tree in one answer plus the
 * wholly-ignored (gitignored) directories as stubs; with one, a stub opened one level.
 */
export const WORKTREE_FILES = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'listFiles',
  method: 'GET',
  call: listFiles,
  consumes: LIST_FILES,
});

/**
 * One file's text (`readFile`), or the binary flag standing in for it. It reads any file in the
 * worktree, tracked or not; a path that names nothing is a 404.
 */
export const WORKTREE_FILE = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'readFile',
  method: 'GET',
  call: readFile,
  consumes: READ_FILE,
});

/** The frameworks and the source-to-test graph (`detect`), stamped with the tree's `generation`. */
export const WORKTREE_DETECTION = qitsOperation({
  provider: 'qits-workspace-daemon',
  operationId: 'detect',
  method: 'GET',
  call: detect,
  consumes: DETECT,
});
