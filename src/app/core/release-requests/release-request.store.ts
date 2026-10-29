import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  listCommitBuilds,
  getProjectReleaseRequest,
  getReleaseRequestApprovalEligibility,
  getReleaseRequestArtifacts as getReleaseArtifacts,
  listReleaseRequestCommits,
  approveReleaseRequest,
  rerunReleaseRequestAutomation as rerunReleaseAutomation,
  waiveReleaseRequestAutomations as waiveReleaseAutomations,
  declineReleaseRequest,
  overrideReleaseRequestUpstream,
  rerunReleasePipelinePhase as rerunReleasePhase,
  moveReleaseRequestSource,
  setReleaseSourcePriority,
  withdrawReleaseRequest,
} from '../../api/projects';
import { NOTHING } from '@qits/angular';
import {
  GET_APPROVAL_ELIGIBILITY,
  GET_PROJECT_RELEASE_REQUEST,
  GET_RELEASE_ARTIFACTS,
  LIST_COMMIT_BUILDS,
  CHANGED_RELEASE_REQUEST,
  LIST_RELEASE_REQUEST_COMMITS,
  MOVED_RELEASE_REQUEST_SOURCE,
  type ApprovalEligibility,
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

/**
 * What a source move answered (qits-1665): both requests as they are now, `from` (the one the
 * branch left) and `to` (the one queued after it), or why it was refused, as {@link ChangeOutcome}.
 */
export type MoveOutcome =
  | {
      readonly from: ReleaseRequest;
      readonly to: ReleaseRequest;
      readonly status?: undefined;
      readonly message?: undefined;
    }
  | {
      readonly from?: undefined;
      readonly to?: undefined;
      readonly status: number;
      readonly message?: string;
    };

/** The service's `message` on a refusal, if it sent one; the OpenAPI document gives it no body. */
function messageOf(error: unknown): string | undefined {
  const message =
    error !== null && typeof error === 'object' && 'message' in error ? error.message : undefined;
  return typeof message === 'string' && message.trim() ? message : undefined;
}

/**
 * The read of the request itself: a {@link Read}, or `missing` when its project has no such
 * request (404).
 */
export type RequestRead =
  Read<ReleaseRequest> | { readonly status: 'missing'; readonly value?: undefined };

const MISSING: RequestRead = { status: 'missing' };

/** One release request's page data, as `load` and `refresh` left it. */
export interface ReleaseRequestView {
  /** The project the request is read through. */
  readonly projectId: string;
  /** The request itself. Its `repoId` and `id` address every read and change after it. */
  readonly request: RequestRead;
  /** The request's logical id (`<repository>-rr-<n>`), from the project's answer. */
  readonly qualifiedId?: string;
  /** The commits its fold brought in, read once per fold. */
  readonly commits: Read<ReleaseCommits>;
  /** The CI verdicts on its fold, read once per fold; none while nothing is folded. */
  readonly builds: Read<readonly CommitBuild[]>;
  /** What it published, read once a tag is cut; `undefined` before. */
  readonly artifacts?: Read<ReleaseArtifacts>;
  /** The fold (`mergedSha`, `''` for none) the commits and the verdicts were read for. */
  readonly fold?: string;
  /**
   * What the viewer may approve (epic qits-1038), read once per fold and set of requirements;
   * `undefined` while the request carries no requirements (an older qits-projects, or none on the
   * fold). A failed read (an older qits-projects answers 404) leaves the approval drawn as before.
   */
  readonly eligibility?: Read<ApprovalEligibility>;
  /** The fold and requirement ids {@link eligibility} was read for. */
  readonly eligibilityOf?: string;
}

interface ReleaseRequestState {
  /** Each request's page data, by the reference its page was opened with (uuid or logical id). */
  readonly byId: Readonly<Record<string, ReleaseRequestView>>;
}

/**
 * One release request's page data, from qits-projects (ported from qits-projects-frontend's
 * `release-request-detail-page`). The page's URL names only the request, by its uuid or its
 * logical id (`ref`), so the request is read through its project
 * (`getProjectReleaseRequest`), which answers both; its answer names the repository every read
 * after it is addressed by. The data is kept by that `ref`.
 *
 * - `load(projectId, ref)` reads the request, once, and again after an error or a "no such
 *   request". Then, for its fold, the commits it brought in and the CI verdicts on it; and once a
 *   tag is cut (RELEASED or FINALIZED), what it published. A 404 leaves the request `missing`.
 *   When the request names approval requirements (epic qits-1038), what the viewer may approve
 *   (`eligibility`, read by `approvalEligibility`), once per fold and set of requirements.
 * - `refresh(ref)` reads the request again and keeps the old data until the answer is in. The
 *   commits and the verdicts are read again only when the fold moved, the artifacts only the first
 *   time the request is released: each is a fact about the fold or the tag, so an answer that
 *   names the same fold costs one read.
 * - `retry(ref, part)` reads one failed part again.
 * - `put(request)` replaces the request with an answer a change gave back (approve, priority…),
 *   under every `ref` that shows it.
 * - `of(ref)`: the data, or undefined before `load`.
 * - The changes a person makes: `approve` and `decline` (the fold the reader saw travels with the
 *   decision; a moved fold is refused 409), `withdraw`, `rerunPhase`, `setSourcePriority`,
 *   `rerunAutomation`, `waiveAutomations` and `overrideUpstream` (epic qits-897). Each answers a {@link ChangeOutcome}; a change that
 *   answers the request puts it in place (`put`). `moveSource` (qits-1665) answers both requests
 *   (a {@link MoveOutcome}) and puts both in place. `rerunAutomation` answers 202 and no request:
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

    function set(ref: string, change: Partial<ReleaseRequestView>): void {
      const current = store.byId()[ref];
      if (!current && change.projectId === undefined) return;
      patchState(store, {
        byId: {
          ...store.byId(),
          [ref]: { ...EMPTY, ...current, ...change } as ReleaseRequestView,
        },
      });
    }

    /** The repository and uuid of the request shown under `ref`; empty before it is read. */
    function addressOf(ref: string): { readonly repoId: string; readonly requestId: string } {
      const request = store.byId()[ref]?.request.value;
      return { repoId: request?.repoId ?? '', requestId: request?.id ?? '' };
    }

    async function readCommits(ref: string, fold: string): Promise<void> {
      const { repoId, requestId } = addressOf(ref);
      if (!repoId || !requestId) return;
      set(ref, { commits: LOADING });
      const { data, error } = await consume(
        listReleaseRequestCommits({ path: { repoId, requestId } }),
        LIST_RELEASE_REQUEST_COMMITS,
      );
      if (store.byId()[ref]?.fold !== fold) return;
      set(ref, { commits: error !== undefined || !data ? FAILED : loaded(data) });
    }

    async function readBuilds(ref: string, fold: string): Promise<void> {
      if (!fold) {
        set(ref, { builds: loaded([]) });
        return;
      }
      const { repoId } = addressOf(ref);
      if (!repoId) return;
      set(ref, { builds: LOADING });
      const { data, error } = await consume(
        listCommitBuilds({ path: { repoId, commitHash: fold } }),
        LIST_COMMIT_BUILDS,
      );
      if (store.byId()[ref]?.fold !== fold) return;
      set(ref, {
        builds: error !== undefined || !data ? FAILED : loaded(data.builds ?? []),
      });
    }

    async function readArtifacts(ref: string): Promise<void> {
      const { repoId, requestId } = addressOf(ref);
      if (!repoId || !requestId) return;
      set(ref, { artifacts: LOADING });
      const { data, error } = await consume(
        getReleaseArtifacts({ path: { repoId, requestId } }),
        GET_RELEASE_ARTIFACTS,
      );
      set(ref, { artifacts: error !== undefined || !data ? FAILED : loaded(data) });
    }

    /**
     * `GET …/{requestId}/approval-eligibility` (epic qits-1038): which requirements on the
     * request's fold the caller may satisfy. The door answers them under `eligibility`.
     */
    async function approvalEligibility(
      repoId: string,
      requestId: string,
    ): Promise<Read<ApprovalEligibility>> {
      const { data, error } = await consume(
        getReleaseRequestApprovalEligibility({ path: { repoId, requestId } }),
        GET_APPROVAL_ELIGIBILITY,
      );
      const eligibility = error === undefined ? data?.eligibility : undefined;
      return eligibility ? loaded(eligibility) : FAILED;
    }

    async function readEligibility(ref: string, of: string): Promise<void> {
      const { repoId, requestId } = addressOf(ref);
      if (!repoId || !requestId) return;
      set(ref, { eligibility: LOADING, eligibilityOf: of });
      const eligibility = await approvalEligibility(repoId, requestId);
      if (store.byId()[ref]?.eligibilityOf !== of) return;
      set(ref, { eligibility });
    }

    /** The reads that follow an answer: per new fold, and once after the tag. */
    async function follow(ref: string, request: ReleaseRequest): Promise<void> {
      const view = store.byId()[ref];
      if (!view) return;
      const fold = request.mergedSha ?? '';
      const reads: Promise<void>[] = [];
      // What the viewer may approve depends on the fold's requirements, not on who satisfied them.
      const requirements = request.approvalRequirements;
      if (Array.isArray(requirements) && requirements.length > 0) {
        const of = [fold, ...requirements.map((requirement) => requirement.id ?? '')].join(' ');
        if (view.eligibilityOf !== of) reads.push(readEligibility(ref, of));
      } else if (view.eligibilityOf !== undefined) {
        set(ref, { eligibility: undefined, eligibilityOf: undefined });
      }
      if (view.fold !== fold) {
        set(ref, { fold });
        reads.push(readCommits(ref, fold), readBuilds(ref, fold));
      }
      if (hasReleased(request) && view.artifacts === undefined) {
        reads.push(readArtifacts(ref));
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

    /**
     * Puts an answer a change gave back in place of the request, under every `ref` that shows it,
     * then reads what follows it.
     */
    async function put(request: ReleaseRequest): Promise<void> {
      const refs = Object.entries(store.byId())
        .filter(([, view]) => !!request.id && view.request.value?.id === request.id)
        .map(([ref]) => ref);
      await Promise.all(
        refs.map((ref) => {
          // A read in flight began before the change, so its answer is older: drop it.
          reads.set(ref, (reads.get(ref) ?? 0) + 1);
          set(ref, { request: loaded(request) });
          return follow(ref, request);
        }),
      );
    }

    /** Reads again every `ref` that shows the request `requestId`. */
    async function reread(requestId: string): Promise<void> {
      const refs = Object.entries(store.byId())
        .filter(([, view]) => !!requestId && view.request.value?.id === requestId)
        .map(([ref]) => ref);
      await Promise.all(refs.map((ref) => read(ref)));
    }

    async function read(ref: string): Promise<void> {
      const projectId = store.byId()[ref]?.projectId;
      if (!projectId) return;
      const seq = (reads.get(ref) ?? 0) + 1;
      reads.set(ref, seq);
      const { data, error, response } = await consume(
        getProjectReleaseRequest({ path: { projectId, ref } }),
        GET_PROJECT_RELEASE_REQUEST,
      );
      if (reads.get(ref) !== seq) return;
      const request = error === undefined ? data?.request : undefined;
      if (!request) {
        // The project has no such request (any more): say so, whether or not it was on show.
        if (response?.status === 404) {
          set(ref, {
            ...EMPTY,
            request: MISSING,
            fold: undefined,
            artifacts: undefined,
            eligibility: undefined,
            eligibilityOf: undefined,
          });
          return;
        }
        // A failed refresh keeps the request on show; a failed first read shows the failure.
        if (store.byId()[ref]?.request.status !== 'loaded') {
          set(ref, { request: FAILED });
        }
        return;
      }
      const { qualifiedId, ...shown } = request;
      set(ref, { request: loaded(shown), qualifiedId });
      await follow(ref, shown);
    }

    return {
      async load(projectId: string, ref: string): Promise<void> {
        if (!projectId || !ref) return;
        const current = store.byId()[ref];
        const status = current?.request.status;
        if (current?.projectId === projectId && status !== 'error' && status !== 'missing') return;
        set(ref, {
          ...EMPTY,
          projectId,
          fold: undefined,
          artifacts: undefined,
          eligibility: undefined,
          eligibilityOf: undefined,
        });
        await read(ref);
      },
      async refresh(ref: string): Promise<void> {
        if (!store.byId()[ref]) return;
        await read(ref);
      },
      /** Reads one failed part again: the request, its commits, its verdicts or its artifacts. */
      async retry(
        ref: string,
        part: 'request' | 'commits' | 'builds' | 'artifacts',
      ): Promise<void> {
        const view = store.byId()[ref];
        if (!view) return;
        const fold = view.fold ?? '';
        if (part === 'request') {
          set(ref, { request: LOADING });
          await read(ref);
        } else if (part === 'commits') await readCommits(ref, fold);
        else if (part === 'builds') await readBuilds(ref, fold);
        else await readArtifacts(ref);
      },
      put,
      approvalEligibility,
      of(ref: string): ReleaseRequestView | undefined {
        return store.byId()[ref];
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
      /**
       * `POST …/{requestId}/upstream-overrides` (epic qits-897): a person lets the request start QA
       * although `upstreamRequestId` (a uuid or a qualified id; the page sends the check's name,
       * the upstream's qualified id) is still building. The answer is the request with that
       * upstream's check PASSED, naming who overrode. A 409 (the override is moot: the upstream is
       * no longer building, or the request moved on) reads the request again, so the page drops
       * the hold it no longer has. A blank note sends none.
       */
      async overrideUpstream(
        repoId: string,
        requestId: string,
        upstreamRequestId: string,
        note?: string,
      ) {
        const trimmed = note?.trim();
        const outcome = await changed(
          await consume(
            overrideReleaseRequestUpstream({
              path: { repoId, requestId },
              body: { upstreamRequestId, ...(trimmed ? { note: trimmed } : {}) },
            }),
            CHANGED_RELEASE_REQUEST,
          ),
        );
        if (outcome.status === 409) await reread(requestId);
        return outcome;
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
      /**
       * `POST …/{requestId}/sources/move` (qits-1665): `branch` leaves the request, which is folded
       * again without it, and joins the one queued after it (minted when there is none). `reason`
       * is required; a blank one is refused 400 by the service. Both requests the answer names are
       * put in place, under every `ref` that shows them.
       */
      async moveSource(
        repoId: string,
        requestId: string,
        branch: string,
        reason: string,
      ): Promise<MoveOutcome> {
        const { data, error, response } = await consume(
          moveReleaseRequestSource({
            path: { repoId, requestId },
            body: { branch, reason: reason.trim() },
          }),
          MOVED_RELEASE_REQUEST_SOURCE,
        );
        const from = error === undefined ? data?.from : undefined;
        const to = error === undefined ? data?.to : undefined;
        if (!from || !to) return { status: response?.status ?? 0, message: messageOf(error) };
        await Promise.all([put(from), put(to)]);
        return { from, to };
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

const EMPTY: Omit<ReleaseRequestView, 'projectId'> = {
  request: LOADING,
  commits: LOADING,
  builds: LOADING,
};

function loaded<T>(value: T): Read<T> {
  return { status: 'loaded', value };
}
