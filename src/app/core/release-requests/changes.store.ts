import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  listCommitChanges,
  getCommitFileDiff,
  listReleaseRequestChanges,
  getReleaseRequestChangeDiff as getReleaseRequestFileDiff,
  getReleaseRequestSubmoduleChanges as getSubmoduleChanges,
  getReleaseRequestSubmoduleChangeDiff as getSubmoduleFileDiff,
} from '../../api/projects';
import {
  GET_FILE_DIFF,
  GET_SUBMODULE_CHANGES,
  LIST_COMMIT_CHANGES,
  LIST_RELEASE_REQUEST_CHANGES,
  type CommitChanges,
  type FileDiff,
  type ReleaseChanges,
  type SubmoduleChanges,
} from './changes.consumes';
import type { Read } from './release-request.store';

/** The keys each read is held under: what was asked, of which fold or commit. */
export const changeKeys = {
  release: (requestId: string, fold: string) => `release:${requestId}@${fold}`,
  releaseDiff: (requestId: string, fold: string, path: string) =>
    `release-diff:${requestId}@${fold}#${path}`,
  submodule: (requestId: string, fold: string, gitlink: string) =>
    `submodule:${requestId}@${fold}#${gitlink}`,
  submoduleDiff: (requestId: string, fold: string, gitlink: string, file: string) =>
    `submodule-diff:${requestId}@${fold}#${gitlink}#${file}`,
  commit: (repoId: string, sha: string) => `commit:${repoId}@${sha}`,
  commitDiff: (repoId: string, sha: string, path: string) => `commit-diff:${repoId}@${sha}#${path}`,
};

interface ChangesState {
  /** Every answer, by the key its method names (what was asked, and of which fold or commit). */
  readonly reads: Readonly<Record<string, Read<unknown>>>;
}

/**
 * What changed, from qits-projects (ported from qits-projects-frontend's Changes tab): a release
 * request's fold (its files, one file's patch, a submodule pin it moves and a file inside that
 * submodule) and a single commit (its files and one file's patch).
 *
 * Each answer is a fact about a commit, so it is read once per key and kept; a read that failed is
 * read again when asked again. Each method starts the read if it is not held and answers the key
 * (`changeKeys`); `read(key)` gives what is held under it. A component starts reads from an effect
 * (they write state) and reads by key in its computeds. The fold's methods take the fold (`mergedSha`), so a
 * re-folded request asks again.
 */
export const ChangesStore = signalStore(
  { providedIn: 'root' },
  withState<ChangesState>({ reads: {} }),
  withMethods((store) => {
    function set(key: string, value: Read<unknown>): void {
      patchState(store, { reads: { ...store.reads(), [key]: value } });
    }

    /** Whether `key` needs reading: never read, or failed. Marks it loading if so. */
    function claim(key: string): boolean {
      const current = store.reads()[key];
      if (current && current.status !== 'error') return false;
      set(key, { status: 'loading' });
      return true;
    }

    function settle(key: string, answer: { data?: unknown; error?: unknown }): void {
      set(
        key,
        answer.error !== undefined || !answer.data
          ? { status: 'error' }
          : { status: 'loaded', value: answer.data },
      );
    }

    return {
      read<T>(key: string): Read<T> | undefined {
        return store.reads()[key] as Read<T> | undefined;
      },
      releaseChanges(repoId: string, requestId: string, fold: string): string {
        const key = changeKeys.release(requestId, fold);
        if (claim(key)) {
          void consume(
            listReleaseRequestChanges({ path: { repoId, requestId } }),
            LIST_RELEASE_REQUEST_CHANGES,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
      releaseFileDiff(repoId: string, requestId: string, fold: string, path: string): string {
        const key = changeKeys.releaseDiff(requestId, fold, path);
        if (claim(key)) {
          void consume(
            getReleaseRequestFileDiff({ path: { repoId, requestId }, query: { path } }),
            GET_FILE_DIFF,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
      submoduleChanges(repoId: string, requestId: string, fold: string, gitlink: string): string {
        const key = changeKeys.submodule(requestId, fold, gitlink);
        if (claim(key)) {
          void consume(
            getSubmoduleChanges({ path: { repoId, requestId }, query: { path: gitlink } }),
            GET_SUBMODULE_CHANGES,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
      submoduleFileDiff(
        repoId: string,
        requestId: string,
        fold: string,
        gitlink: string,
        file: string,
      ): string {
        const key = changeKeys.submoduleDiff(requestId, fold, gitlink, file);
        if (claim(key)) {
          void consume(
            getSubmoduleFileDiff({ path: { repoId, requestId }, query: { path: gitlink, file } }),
            GET_FILE_DIFF,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
      commitChanges(repoId: string, sha: string): string {
        const key = changeKeys.commit(repoId, sha);
        if (claim(key)) {
          void consume(
            listCommitChanges({ path: { repoId, commitHash: sha } }),
            LIST_COMMIT_CHANGES,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
      commitFileDiff(repoId: string, sha: string, path: string): string {
        const key = changeKeys.commitDiff(repoId, sha, path);
        if (claim(key)) {
          void consume(
            getCommitFileDiff({ path: { repoId, commitHash: sha }, query: { path } }),
            GET_FILE_DIFF,
          ).then((answer) => settle(key, answer));
        }
        return key;
      },
    };
  }),
);

export type { CommitChanges, FileDiff, ReleaseChanges, SubmoduleChanges };
