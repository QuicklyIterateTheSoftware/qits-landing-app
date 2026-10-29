import { inject } from '@angular/core';
import { signalStore, withMethods } from '@ngrx/signals';
import { consume } from '@qits/angular';
import { detect, listFiles, readFile } from '../../api/workspace-daemon';
import { PlatformOrigins } from '$core/platform/platform-origins';
import {
  DETECT,
  LIST_FILES,
  READ_FILE,
  type FileContent,
  type FileDetection,
  type FileListing,
} from './agent-files.consumes';
import { agentRoute, type AgentRoute } from './agent-proxy';

/** What a read came to: its value, or the failure's status (0: no answer). */
export type FilesOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

/**
 * The daemon's read cap, in bytes. Nothing publishes a file's size, so it only explains why the
 * viewer cannot tell a large file from a binary one: both arrive as `binary: true`.
 */
export const FILE_CONTENT_CAP_BYTES = 2 * 1024 * 1024;

const failed = (response: { readonly status: number } | undefined) =>
  ({ ok: false, status: response?.status ?? 0 }) as const;

/**
 * An agent's worktree on the daemon of the slot it is placed in, through qits-workspaces' agent
 * proxy (`/workspaces/agent/<agent id>/files…`, `/detection`; epic qits-1667, before it the
 * container proxy of epic qits-1230), for the agent's Files tab, as qits-workspaces-frontend's files
 * panel read it:
 *
 * - `list`: one level of the tree (`listFiles`). Without `path` the whole eager tree in one answer
 *   plus the wholly-ignored (gitignored) directories as stubs; with one, a stub opened one level.
 * - `read`: one file's text (`readFile`), or the binary flag standing in for it. It reads any file
 *   in the worktree, tracked or not; a path that names nothing is a 404.
 * - `detect`: the frameworks and the source-to-test graph (`detect`), stamped with the tree's
 *   `generation`.
 *
 * Nothing is kept: the tab holds what it shows, and reads again on the slot's `files` hint. Every
 * call is the daemon's generated one, addressed at the agent's route on qits-workspaces' origin
 * (`agentRoute`): the service forwards it to the daemon's `agent-worktrees/<agent id>/…` and hands
 * back the daemon's answer.
 *
 * Staleness (qits-1270): none from qits-events. The worktree changes on disk with no domain event
 * (the lifecycle events say when a harness starts and stops, not what it wrote), so the slot's
 * `files` hint (`WorkspaceHints`, a named, lint-allowed exception) stays its trigger.
 */
export const AgentFilesStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => {
    const origins = inject(PlatformOrigins);
    const at = (agentId: string, route: AgentRoute) =>
      agentRoute(origins.api('workspaces'), agentId, route);

    return {
      async list(agentId: string, path?: string): Promise<FilesOutcome<FileListing>> {
        const answer = await consume(
          listFiles({
            ...at(agentId, 'files'),
            path: { agentId },
            // The root is no `path` at all: a blank one would read as a directory called nothing.
            ...(path ? { query: { path } } : {}),
          }),
          LIST_FILES,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
      async read(agentId: string, path: string): Promise<FilesOutcome<FileContent>> {
        const answer = await consume(
          readFile({ ...at(agentId, 'files/content'), path: { agentId }, query: { path } }),
          READ_FILE,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
      async detect(agentId: string): Promise<FilesOutcome<FileDetection>> {
        const answer = await consume(
          detect({ ...at(agentId, 'detection'), path: { agentId } }),
          DETECT,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
    };
  }),
);
