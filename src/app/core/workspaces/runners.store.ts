import type { DestroyRef } from '@angular/core';
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
import type { DomainEvent } from '$core/events/domain-events';
import { injectRefreshOn, payloadIds } from '$core/events/refresh-on';
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
import { SLOT_EVENTS } from './workspace-events';

/**
 * The runner events on qits-events: a runner connected, disconnected, quarantined, reinstated, or
 * health-checked, each naming `runnerId` and `runnerName`. Today only qits-ci sends them, about
 * qits-ci's runners, whose ids are not qits-workspaces'; {@link RunnersStore.follow} counts one
 * only when it names a runner it lists, so they move this page once qits-workspaces announces its
 * own runners in the same vocabulary.
 */
export const RUNNER_EVENTS = [
  'RunnerConnected',
  'RunnerDisconnected',
  'RunnerQuarantined',
  'RunnerReinstated',
  'RunnerHealthChecked',
] as const;

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

const isRunnerEvent = (event: DomainEvent) =>
  !!event.name && (RUNNER_EVENTS as readonly string[]).includes(event.name);

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
 *   the rows. A read again stays `loaded` while it runs, and a failed one keeps the last good list.
 * - `loadHealth(id)` reads a runner's node details (`getRunnerHealth`) once, and again after an
 *   error or when asked to (quietly, once read); a runner never checked answers 204 (`none`).
 * - `follow(destroy, after?)`: while `destroy` lives, reads again after the events below (at most
 *   once a second, `refreshOn`), then runs `after`.
 *
 * Staleness (qits-1270): `RUNNER_EVENTS` naming a listed runner's `runnerId` → `listRunners`, and
 * a `RunnerHealthChecked` naming one whose node details were read → its `getRunnerHealth`;
 * `SLOT_EVENTS` (`AgentPlaced`, `WorkspaceStarted`, `WorkspaceFailed`, `WorkspaceRemoved`; any,
 * since none names its runner) → `listRunners` (the slot counts). The gap: qits-workspaces
 * announces nothing about its runners — no event for a runner connecting or going offline, a
 * quarantine or its lift, a health check or a login check settling, a version roll-over, a
 * registration, an edit or a delete — and the runner events qits-ci sends are about qits-ci's
 * runners. So a runner's connection, quarantine, health, login and version reach this page only
 * with a slot event, after a write of the page's own, or on the next visit; a Run health check or
 * a Re-check stays pending until one of those.
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
    const refreshOn = injectRefreshOn();

    function setHealth(id: string, value: RunnerHealthRead): void {
      patchState(store, { health: { ...store.health(), [id]: value } });
    }

    async function load(): Promise<void> {
      if (store.status() !== 'loaded') patchState(store, { status: 'loading' });
      const { data, error } = await consume(listRunners(), LIST_RUNNERS);
      if (error !== undefined || !data) {
        if (store.status() !== 'loaded') patchState(store, { status: 'error', runners: [] });
        return;
      }
      patchState(store, { status: 'loaded', runners: [...data].sort(byName) });
    }

    async function loadHealth(id: string, again = false): Promise<void> {
      const current = store.health()[id];
      if (!id || (current && current.status !== 'error' && !again)) return;
      if (!current || current.status === 'error') setHealth(id, { status: 'loading', checks: [] });
      const { data, error, response } = await consume(
        getRunnerHealth({ path: { id } }),
        GET_RUNNER_HEALTH,
      );
      if (error !== undefined) {
        // A read again that fails keeps the node details on show.
        if (store.health()[id]?.status !== 'loaded') setHealth(id, { status: 'error', checks: [] });
        return;
      }
      if (response?.status === 204 || !data) {
        setHealth(id, { status: 'none', checks: [] });
        return;
      }
      setHealth(id, { status: 'loaded', checks: data.checks ?? [] });
    }

    return {
      load,
      loadHealth,
      follow(destroy: DestroyRef, after?: () => void): void {
        refreshOn(
          {
            names: [...RUNNER_EVENTS, ...SLOT_EVENTS],
            when: (event, ids) =>
              !isRunnerEvent(event) ||
              (!!ids.runnerId && store.runners().some((runner) => runner.id === ids.runnerId)),
            refresh: async (events) => {
              const checked = new Set(
                events
                  .filter((event) => event.name === 'RunnerHealthChecked')
                  .flatMap((event) => {
                    const id = payloadIds(event).runnerId;
                    return id && store.health()[id] ? [id] : [];
                  }),
              );
              await Promise.all([load(), ...[...checked].map((id) => loadHealth(id, true))]);
              after?.();
            },
          },
          destroy,
        );
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
