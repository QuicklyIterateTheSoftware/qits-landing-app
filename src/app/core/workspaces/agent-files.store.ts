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
import { containerBase } from './agent-harness.store';

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
 * An agent's worktree on its slot's daemon, through qits-workspaces' container proxy (epic
 * qits-1230), for the agent's Files tab, as qits-workspaces-frontend's files panel read it:
 *
 * - `list`: one level of the tree (`listFiles`). Without `path` the whole eager tree in one answer
 *   plus the wholly-ignored (gitignored) directories as stubs; with one, a stub opened one level.
 * - `read`: one file's text (`readFile`), or the binary flag standing in for it. It reads any file
 *   in the worktree, tracked or not; a path that names nothing is a 404.
 * - `detect`: the frameworks and the source-to-test graph (`detect`), stamped with the tree's
 *   `generation`.
 *
 * Nothing is kept: the tab holds what it shows, and reads again on the slot's `files` hint. Every
 * call gets the container's base as its `baseUrl`, at qits-workspaces' origin.
 *
 * Staleness (qits-1270): none from qits-events. The worktree changes on disk with no domain event
 * (the lifecycle events say when a harness starts and stops, not what it wrote), so the slot's
 * `files` hint (`WorkspaceHints`, a named, lint-allowed exception) stays its trigger.
 */
export const AgentFilesStore = signalStore(
  { providedIn: 'root' },
  withMethods(() => {
    const origins = inject(PlatformOrigins);
    const base = (workspaceRowId: number) =>
      containerBase(origins.api('workspaces'), workspaceRowId);

    return {
      async list(
        workspaceRowId: number,
        agentId: string,
        path?: string,
      ): Promise<FilesOutcome<FileListing>> {
        const answer = await consume(
          listFiles({
            baseUrl: base(workspaceRowId),
            path: { agentId },
            // The root is no `path` at all: a blank one would read as a directory called nothing.
            ...(path ? { query: { path } } : {}),
          }),
          LIST_FILES,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
      async read(
        workspaceRowId: number,
        agentId: string,
        path: string,
      ): Promise<FilesOutcome<FileContent>> {
        const answer = await consume(
          readFile({ baseUrl: base(workspaceRowId), path: { agentId }, query: { path } }),
          READ_FILE,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
      async detect(workspaceRowId: number, agentId: string): Promise<FilesOutcome<FileDetection>> {
        const answer = await consume(
          detect({ baseUrl: base(workspaceRowId), path: { agentId } }),
          DETECT,
        );
        if (answer.error !== undefined || !answer.data) return failed(answer.response);
        return { ok: true, value: answer.data };
      },
    };
  }),
);
