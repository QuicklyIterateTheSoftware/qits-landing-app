import type { Consumed } from '@qits/angular';
import type {
  DetectResponses,
  ListFilesResponses,
  ReadFileResponses,
} from '../../api/workspace-daemon';

/**
 * What `AgentFilesStore` reads from qits-workspace-daemon's answers, through qits-workspaces'
 * container proxy (epic qits-1230), for the agent's Files tab. The store passes each list to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same lists as
 * `consumes`. To read another field, add it here.
 */

/**
 * `AgentFilesStore.list(workspaceRowId, agentId, path?)`: one level of the agent's worktree
 * (`listFiles`). Without `path`, the whole eager tree (deep paths) and every wholly-ignored
 * directory as a stub; with one, that directory one level deep, its subdirectories as stubs. The
 * `generation` gates the detection.
 */
export const LIST_FILES = [
  'paths',
  'lazyDirs[].path',
  'lazyDirs[].childCount',
  'generation',
] as const;

/** One level of the worktree, cut to what the store reads. */
export type FileListing = Consumed<ListFilesResponses[200], typeof LIST_FILES>;

/**
 * `AgentFilesStore.read(workspaceRowId, agentId, path)`: one file's text (`readFile`), or
 * `binary: true` without it (a binary file, or one over the daemon's 2 MB cap: the same answer).
 * A 404 (the path names nothing) binds the status only.
 */
export const READ_FILE = ['path', 'binary', 'content'] as const;

/** One file, cut to what the store reads. */
export type FileContent = Consumed<ReadFileResponses[200], typeof READ_FILE>;

/**
 * `AgentFilesStore.detect(workspaceRowId, agentId)`: the frameworks the tree's footer toggles (each
 * a whitelist of member paths) and the source-to-test graph the viewer's test links come from
 * (`detect`), stamped with the tree's `generation`.
 */
export const DETECT = [
  'frameworks[].frameworkId',
  'frameworks[].root',
  'frameworks[].label',
  'frameworks[].memberPaths',
  'links[].path',
  'links[].tests[].path',
  'generation',
] as const;

/** The detection, cut to what the store reads. */
export type FileDetection = Consumed<DetectResponses[200], typeof DETECT>;

/** One source file and the tests that reach it, cut to what the store reads. */
export type FileLink = FileDetection['links'][number];
