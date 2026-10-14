import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { consume } from '@qits/angular';
import {
  createRunner,
  deleteRunner,
  getRunnerHealth,
  greenlightRunner,
  listRunners,
  patchRunner,
  requestRunnerHealthcheck,
  requestRunnerLoginCheck,
  rotateRunnerRegistrationToken,
} from '../../api/workspaces';
import { refusalOf, type ActionOutcome, type Refusal } from './agent-actions.store';
import { REFUSAL } from './agent-actions.consumes';
import {
  GET_RUNNER_HEALTH,
  GREENLIGHT_RUNNER,
  LIST_RUNNERS,
  OWNS_WORKSPACES_REFUSAL,
  PATCH_RUNNER,
  RUNNER_REGISTRATION,
  STATUS_ONLY,
  type GreenlitRunner,
  type PatchedRunner,
  type Runner,
  type RunnerHealth,
  type RunnerRegistration,
} from './runners.consumes';

type Status = 'idle' | 'loading' | 'loaded' | 'error';

/** One runner's node details, as `loadHealth(id)` left them. `none`: never checked (204). */
export interface RunnerHealthRead {
  readonly status: 'loading' | 'loaded' | 'none' | 'error';
  readonly checks: NonNullable<RunnerHealth['checks']>;
}

interface RunnersState {
  readonly status: Status;
  /** Every runner, by name. */
  readonly runners: readonly Runner[];
  /** Each runner's node details, by runner id, once asked for. */
  readonly health: Readonly<Record<string, RunnerHealthRead>>;
}

/** What the register form sends. Blank optional fields are left out: the service's defaults. */
export interface NewRunner {
  /** `[a-z][a-z0-9-]{0,63}`, unique. */
  readonly name: string;
  readonly description?: string;
  readonly slots?: number;
  readonly workspaceMemoryLimit?: string;
  readonly workspaceMemorySwapLimit?: string;
}

/**
 * What an edit sends. An absent field is left as it is; a blank one clears it (the description,
 * or a memory cap back to the platform default).
 */
export interface RunnerChange {
  readonly slots?: number;
  readonly description?: string;
  readonly workspaceMemoryLimit?: string;
  readonly workspaceMemorySwapLimit?: string;
}

/** A refused delete: the refusal, and the ACTIVE workspaces' row ids when the runner owns some. */
export interface DeleteRefusal extends Refusal {
  readonly workspaceIds?: readonly number[];
}

/** What a delete came to. */
export type DeleteOutcome = { readonly ok: true } | ({ readonly ok: false } & DeleteRefusal);

/** The refusal a delete answers while the runner still owns an ACTIVE workspace. */
export const RUNNER_OWNS_WORKSPACES = 'RUNNER_OWNS_WORKSPACES';

const byName = (a: Runner, b: Runner) => (a.name ?? '').localeCompare(b.name ?? '');

/** `{ ok: true }` with `value`, or the refusal read off the failed answer. */
function outcome<T>(result: {
  readonly data?: T;
  readonly error?: unknown;
  readonly response?: { readonly status: number };
}): ActionOutcome<T> {
  if (result.error !== undefined || !result.data) return refusalOf(result.error, result.response);
  return { ok: true, value: result.data };
}

/**
 * qits-workspaces' runners, for the Runners page (`/projects/<slug>/workspaces/runners`, epic
 * qits-1230), as qits-workspaces-frontend's runners page read and wrote them. Runners are the
 * estate's, not one project's.
 *
 * - `load()` reads every runner (`listRunners`), sorted by name, so a read again never reshuffles
 *   the rows. A failed read keeps the last good list (the page reads again every 5 s: there are no
 *   runner events).
 * - `loadHealth(id)` reads a runner's node details (`getRunnerHealth`) once, and again after an
 *   error or when asked to; a runner never checked answers 204 (`none`).
 * - The writes answer an {@link ActionOutcome}, a refusal in the service's words:
 *   `createRunner` and `rotateToken` (the one-time install line), `patchRunner` (slots,
 *   description, memory caps), `greenlight` (lifts a quarantine — nothing here quarantines a
 *   runner: the service does that itself after a failed health check), `requestHealthcheck` and
 *   `requestLoginCheck` (queued, 202; an offline runner is refused, 409 `RUNNER_UNAVAILABLE`), and
 *   `deleteRunner` (refused, 409 {@link RUNNER_OWNS_WORKSPACES}, while it owns ACTIVE workspaces,
 *   whose row ids the refusal names).
 */
export const RunnersStore = signalStore(
  { providedIn: 'root' },
  withState<RunnersState>({ status: 'idle', runners: [], health: {} }),
  withMethods((store) => {
    function setHealth(id: string, value: RunnerHealthRead): void {
      patchState(store, { health: { ...store.health(), [id]: value } });
    }

    return {
      async load(): Promise<void> {
        if (store.status() !== 'loaded') patchState(store, { status: 'loading' });
        const { data, error } = await consume(listRunners(), LIST_RUNNERS);
        if (error !== undefined || !data) {
          if (store.status() !== 'loaded') patchState(store, { status: 'error', runners: [] });
          return;
        }
        patchState(store, { status: 'loaded', runners: [...data].sort(byName) });
      },
      async loadHealth(id: string, again = false): Promise<void> {
        const current = store.health()[id];
        if (!id || (current && current.status !== 'error' && !again)) return;
        if (!current || current.status === 'error')
          setHealth(id, { status: 'loading', checks: [] });
        const { data, error, response } = await consume(
          getRunnerHealth({ path: { id } }),
          GET_RUNNER_HEALTH,
        );
        if (error !== undefined) {
          setHealth(id, { status: 'error', checks: [] });
          return;
        }
        if (response?.status === 204 || !data) {
          setHealth(id, { status: 'none', checks: [] });
          return;
        }
        setHealth(id, { status: 'loaded', checks: data.checks ?? [] });
      },
      healthOf(id: string): RunnerHealthRead | undefined {
        return store.health()[id];
      },
      async createRunner(runner: NewRunner): Promise<ActionOutcome<RunnerRegistration>> {
        return outcome(
          await consume(createRunner({ body: { ...runner } }), RUNNER_REGISTRATION, REFUSAL),
        );
      },
      async rotateToken(id: string): Promise<ActionOutcome<RunnerRegistration>> {
        return outcome(
          await consume(
            rotateRunnerRegistrationToken({ path: { id } }),
            RUNNER_REGISTRATION,
            REFUSAL,
          ),
        );
      },
      async patchRunner(id: string, change: RunnerChange): Promise<ActionOutcome<PatchedRunner>> {
        return outcome(
          await consume(patchRunner({ path: { id }, body: { ...change } }), PATCH_RUNNER, REFUSAL),
        );
      },
      async greenlight(id: string): Promise<ActionOutcome<GreenlitRunner>> {
        return outcome(
          await consume(greenlightRunner({ path: { id } }), GREENLIGHT_RUNNER, REFUSAL),
        );
      },
      async requestHealthcheck(id: string): Promise<ActionOutcome<void>> {
        const result = await consume(
          requestRunnerHealthcheck({ path: { id } }),
          STATUS_ONLY,
          REFUSAL,
        );
        if (result.error !== undefined) return refusalOf(result.error, result.response);
        return { ok: true, value: undefined };
      },
      async requestLoginCheck(id: string): Promise<ActionOutcome<void>> {
        const result = await consume(
          requestRunnerLoginCheck({ path: { id } }),
          STATUS_ONLY,
          REFUSAL,
        );
        if (result.error !== undefined) return refusalOf(result.error, result.response);
        return { ok: true, value: undefined };
      },
      async deleteRunner(id: string): Promise<DeleteOutcome> {
        const { error, response } = await consume(
          deleteRunner({ path: { id } }),
          STATUS_ONLY,
          OWNS_WORKSPACES_REFUSAL,
        );
        if (error === undefined) return { ok: true };
        // Typed per status by the OpenAPI document (only the 409 is `ApiError`): checked, not trusted.
        const ids = (error as { readonly workspaceIds?: unknown } | null)?.workspaceIds;
        return {
          ...refusalOf(error, response),
          ...(Array.isArray(ids)
            ? { workspaceIds: ids.filter((n): n is number => typeof n === 'number') }
            : {}),
        };
      },
    };
  }),
);
