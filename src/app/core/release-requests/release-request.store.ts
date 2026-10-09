import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  getProjectsApiRepositoriesByRepoIdCommitsByCommitHashBuilds as listCommitBuilds,
  getProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestId as getReleaseRequest,
  getProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdArtifacts as getReleaseArtifacts,
  getProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdCommits as listReleaseRequestCommits,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdApprove as approveReleaseRequest,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdAutomationsByKindRuns as rerunReleaseAutomation,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdAutomationsWaivers as waiveReleaseAutomations,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdDecline as declineReleaseRequest,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdPipelineByPhaseRerun as rerunReleasePhase,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdSourcesPriority as setReleaseSourcePriority,
  postProjectsApiRepositoriesByRepoIdReleaseRequestsByRequestIdWithdraw as withdrawReleaseRequest,
} from '../../api/projects';
import { NOTHING } from '@qits/angular';
import {
  GET_RELEASE_ARTIFACTS,
  GET_RELEASE_REQUEST,
  LIST_COMMIT_BUILDS,
  CHANGED_RELEASE_REQUEST,
  LIST_RELEASE_REQUEST_COMMITS,
  type CommitBuild,
  type ReleaseArtifacts,
  type ReleaseCommits,
  type ReleaseRequest,
} from './release-request.consumes';
import { hasReleased } from './release-request-model';

/** A read that may still be on its way, may have failed, or answered `value`. */
export interface Read<T> {
  readonly status: 'loading' | 'loaded' | 'error';
  readonly value?: T;
}

const LOADING: Read<never> = { status: 'loading' };
const FAILED: Read<never> = { status: 'error' };

/**
 * What a change answered: the request as it is now, or why it was refused — the HTTP status
 * (0: no answer) and the service's message, when it sent one.
 */
export type ChangeOutcome =
  | { readonly request: ReleaseRequest; readonly status?: undefined; readonly message?: undefined }
  | { readonly request?: undefined; readonly status: number; readonly message?: string };

/** The service's `message` on a refusal, if it sent one; the OpenAPI document gives it no body. */
function messageOf(error: unknown): string | undefined {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

/** One release request's page data, as `load` and `refresh` left it. */
export interface ReleaseRequestView {
  readonly repoId: string;
  /** The request itself. */
  readonly request: Read<ReleaseRequest>;
  /** The commits its fold brought in, read once per fold. */
  readonly commits: Read<ReleaseCommits>;
  /** The CI verdicts on its fold, read once per fold; none while nothing is folded. */
  readonly builds: Read<readonly CommitBuild[]>;
  /** What it published, read once a tag is cut; `undefined` before. */
  readonly artifacts?: Read<ReleaseArtifacts>;
  /** The fold (`mergedSha`, `''` for none) the commits and the verdicts were read for. */
  readonly fold?: string;
}

interface ReleaseRequestState {
  /** Each request's page data, by request id. */
  readonly byId: Readonly<Record<string, ReleaseRequestView>>;
}

/**
 * One release request's page data, from qits-projects (ported from qits-projects-frontend's
 * `release-request-detail-page`). Every read is addressed by repository and request id.
 *
 * - `load(repoId, requestId)` reads the request, once, and again after an error. Then, for its
 *   fold, the commits it brought in and the CI verdicts on it; and once a tag is cut (RELEASED or
 *   FINALIZED), what it published.
 * - `refresh(repoId, requestId)` reads the request again and keeps the old data until the answer
 *   is in. The commits and the verdicts are read again only when the fold moved, the artifacts only
 *   the first time the request is released: each is a fact about the fold or the tag, so an answer
 *   that names the same fold costs one read.
 * - `retry(requestId, part)` reads one failed part again.
 * - `put(request)` replaces the request with an answer a change gave back (approve, priority…).
 * - `of(requestId)`: the data, or undefined before `load`.
 * - The changes a person makes: `approve` and `decline` (the fold the reader saw travels with the
 *   decision; a moved fold is refused 409), `withdraw`, `rerunPhase`, `setSourcePriority`,
 *   `rerunAutomation` and `waiveAutomations`. Each answers a {@link ChangeOutcome}; a change that
 *   answers the request puts it in place (`put`). `rerunAutomation` answers 202 and no request:
 *   the automation's row moves on the next refresh.
 *
 * The page calls `load` in the browser, and `refresh` when a domain event says the request may
 * have changed.
 */
export const ReleaseRequestStore = signalStore(
  { providedIn: 'root' },
  withState<ReleaseRequestState>({ byId: {} }),
  withMethods((store) => {
    /** The newest read of each request, so an older answer arriving late is dropped. */
    const reads = new Map<string, number>();

    function set(requestId: string, change: Partial<ReleaseRequestView>): void {
      const current = store.byId()[requestId];
      if (!current && change.repoId === undefined) return;
      patchState(store, {
        byId: {
          ...store.byId(),
          [requestId]: { ...EMPTY, ...current, ...change } as ReleaseRequestView,
        },
      });
    }

    async function readCommits(repoId: string, requestId: string, fold: string): Promise<void> {
      set(requestId, { commits: LOADING });
      const { data, error } = await consume(
        listReleaseRequestCommits({ path: { repoId, requestId } }),
        LIST_RELEASE_REQUEST_COMMITS,
      );
      if (store.byId()[requestId]?.fold !== fold) return;
      set(requestId, { commits: error !== undefined || !data ? FAILED : loaded(data) });
    }

    async function readBuilds(repoId: string, requestId: string, fold: string): Promise<void> {
      if (!fold) {
        set(requestId, { builds: loaded([]) });
        return;
      }
      set(requestId, { builds: LOADING });
      const { data, error } = await consume(
        listCommitBuilds({ path: { repoId, commitHash: fold } }),
        LIST_COMMIT_BUILDS,
      );
      if (store.byId()[requestId]?.fold !== fold) return;
      set(requestId, {
        builds: error !== undefined || !data ? FAILED : loaded(data.builds ?? []),
      });
    }

    async function readArtifacts(repoId: string, requestId: string): Promise<void> {
      set(requestId, { artifacts: LOADING });
      const { data, error } = await consume(
        getReleaseArtifacts({ path: { repoId, requestId } }),
        GET_RELEASE_ARTIFACTS,
      );
      set(requestId, { artifacts: error !== undefined || !data ? FAILED : loaded(data) });
    }

    /** The reads that follow an answer: per new fold, and once after the tag. */
    async function follow(repoId: string, request: ReleaseRequest): Promise<void> {
      const requestId = request.id ?? '';
      const view = store.byId()[requestId];
      if (!view) return;
      const fold = request.mergedSha ?? '';
      const reads: Promise<void>[] = [];
      if (view.fold !== fold) {
        set(requestId, { fold });
        reads.push(readCommits(repoId, requestId, fold), readBuilds(repoId, requestId, fold));
      }
      if (hasReleased(request) && view.artifacts === undefined) {
        reads.push(readArtifacts(repoId, requestId));
      }
      await Promise.all(reads);
    }

    /** A change's answer as an outcome; the request it answered is put in place. */
    async function changed(answer: {
      readonly data?: { readonly request?: ReleaseRequest };
      readonly error?: unknown;
      readonly response?: { readonly status: number };
    }): Promise<ChangeOutcome> {
      const { data, error, response } = answer;
      const request = error === undefined ? data?.request : undefined;
      if (!request) return { status: response?.status ?? 0, message: messageOf(error) };
      await put(request);
      return { request };
    }

    /** Puts an answer a change gave back in place of the request, then reads what follows it. */
    async function put(request: ReleaseRequest): Promise<void> {
      const requestId = request.id ?? '';
      const view = store.byId()[requestId];
      if (!view) return;
      // A read in flight began before the change, so its answer is older: drop it.
      reads.set(requestId, (reads.get(requestId) ?? 0) + 1);
      set(requestId, { request: loaded(request) });
      await follow(view.repoId, request);
    }

    async function read(repoId: string, requestId: string): Promise<void> {
      const seq = (reads.get(requestId) ?? 0) + 1;
      reads.set(requestId, seq);
      const { data, error } = await consume(
        getReleaseRequest({ path: { repoId, requestId } }),
        GET_RELEASE_REQUEST,
      );
      if (reads.get(requestId) !== seq) return;
      const request = error === undefined ? data?.request : undefined;
      if (!request) {
        // A failed refresh keeps the request on show; a failed first read shows the failure.
        if (store.byId()[requestId]?.request.status !== 'loaded') {
          set(requestId, { request: FAILED });
        }
        return;
      }
      set(requestId, { request: loaded(request) });
      await follow(repoId, request);
    }

    return {
      async load(repoId: string, requestId: string): Promise<void> {
        const current = store.byId()[requestId];
        if (!repoId || !requestId) return;
        if (current && current.request.status !== 'error') return;
        set(requestId, { ...EMPTY, repoId });
        await read(repoId, requestId);
      },
      async refresh(repoId: string, requestId: string): Promise<void> {
        if (!store.byId()[requestId]) return;
        await read(repoId, requestId);
      },
      /** Reads one failed part again: the request, its commits, its verdicts or its artifacts. */
      async retry(
        requestId: string,
        part: 'request' | 'commits' | 'builds' | 'artifacts',
      ): Promise<void> {
        const view = store.byId()[requestId];
        if (!view) return;
        const { repoId } = view;
        const fold = view.fold ?? '';
        if (part === 'request') {
          set(requestId, { request: LOADING });
          await read(repoId, requestId);
        } else if (part === 'commits') await readCommits(repoId, requestId, fold);
        else if (part === 'builds') await readBuilds(repoId, requestId, fold);
        else await readArtifacts(repoId, requestId);
      },
      put,
      of(requestId: string): ReleaseRequestView | undefined {
        return store.byId()[requestId];
      },
      async approve(repoId: string, requestId: string, mergedSha: string, note?: string) {
        const trimmed = note?.trim();
        return changed(
          await consume(
            approveReleaseRequest({
              path: { repoId, requestId },
              body: { mergedSha, ...(trimmed ? { note: trimmed } : {}) },
            }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      async decline(repoId: string, requestId: string, mergedSha: string, note?: string) {
        const trimmed = note?.trim();
        return changed(
          await consume(
            declineReleaseRequest({
              path: { repoId, requestId },
              body: { mergedSha, ...(trimmed ? { note: trimmed } : {}) },
            }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      /** A blank reason leaves the service to name the caller. */
      async withdraw(repoId: string, requestId: string, reason?: string) {
        const trimmed = reason?.trim();
        return changed(
          await consume(
            withdrawReleaseRequest({
              path: { repoId, requestId },
              body: trimmed ? { reason: trimmed } : {},
            }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      async rerunPhase(repoId: string, requestId: string, phase: string) {
        return changed(
          await consume(
            rerunReleasePhase({ path: { repoId, requestId, phase } }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      async setSourcePriority(repoId: string, requestId: string, branch: string, priority: string) {
        return changed(
          await consume(
            setReleaseSourcePriority({ path: { repoId, requestId }, body: { branch, priority } }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      async waiveAutomations(repoId: string, requestId: string, foldSha: string, reason: string) {
        return changed(
          await consume(
            waiveReleaseAutomations({ path: { repoId, requestId }, body: { foldSha, reason } }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
      },
      /** Dispatches a run of one automation; true when the service took it (202). */
      async rerunAutomation(
        repoId: string,
        requestId: string,
        kind: string,
      ): Promise<{ readonly status: number; readonly message?: string }> {
        const { error, response } = await consume(
          rerunReleaseAutomation({ path: { repoId, requestId, kind } }),
          NOTHING,
        );
        return { status: response?.status ?? 0, message: messageOf(error) };
      },
    };
  }),
);

const EMPTY: Omit<ReleaseRequestView, 'repoId'> = {
  request: LOADING,
  commits: LOADING,
  builds: LOADING,
};

function loaded<T>(value: T): Read<T> {
  return { status: 'loaded', value };
}
