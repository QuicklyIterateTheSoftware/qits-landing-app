import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { qitsMutation } from '@qits/angular';
import {
  moveRefusal,
  workRef,
  type DispatchMode,
  type FinishState,
  type WorkStatus,
} from './moves';
import { FINISH_DELAY_MS } from './finish-delay';
import { PendingFinishes } from './pending-finishes';
import { DISPATCH_WORK } from './project-work.operations';
import { SelectedWork } from './selected-work';
import type { WorkEntry } from './work.consumes';
import { MOVE_WORK } from './work.operations';
import type { DropMove, WorkOutcome } from './work-outcome';

/** Sets or drops `key` in a record signal's value. */
function setIn<T>(
  record: { (): Readonly<Record<string, T>>; set(value: Readonly<Record<string, T>>): void },
  key: string,
  value: T | undefined,
): void {
  const { [key]: _, ...rest } = record();
  record.set(value === undefined ? rest : { ...rest, [key]: value });
}

/**
 * The work section's moves and dispatch presses (qits-2146, in place of `WorkStore`'s writes), each
 * through `qitsMutation`: `MOVE_WORK` (`setWorkStatus`, one door for every archetype, by qualified
 * id) and `DISPATCH_WORK` (`dispatchWork`). One for the app, so a finish waiting for its Undo
 * outlives the page that asked for it (its toast is the shell's).
 *
 * - `transition(projectId, entry, target)` moves any item to a status the archetype registry serves
 *   (the work item page's Status actions) and writes the answered status into `SelectedWork`'s read
 *   (`put`). `transitioning` holds a running or failed move, `refusals` why a move failed (the
 *   409's message verbatim: a quality gate), gone once the item's next move starts.
 * - `transitionAll` moves several items at once (the Schedule tab), each on its own.
 * - `drop(projectId, entry, outcome, supersededBy)` is the Drop form's move into DROPPED, with its
 *   outcome and reference (qits-248), through the same door and state; it also answers.
 * - `finish(projectId, entry)` moves a VERIFIED epic to DONE; `finishLater` is the Acceptance list's
 *   finish: the item is hidden at once (`PendingFinishes`) and `finish` runs after
 *   {@link FINISH_DELAY_MS}, unless `undoFinish(id)` takes it back first. On failure the item shows
 *   again and the pending finish stays `failed` until `dismissFinish`. Leaving the page
 *   (`pagehide`) sends every waiting finish at once, with `keepalive`, so it outlives the page.
 * - `dispatch(entry, mode)` presses dispatch: the answer names the phase it started
 *   (`dispatched`); the status the platform moves the item to arrives as an event.
 *
 * Only the moved entry changes: an epic going to DONE moves none of its features or tasks in
 * qits-projects (only REPORTED ↔ REFINED ↔ READY_FOR_DEV and → IMPLEMENTED cascade, qits-763,
 * qits-887), and any other move reads the work again on its `EntityTransitioned`
 * (`SelectedWork.followTransitions`): a scheduled epic's features and tasks follow it that way.
 */
@Injectable({ providedIn: 'root' })
export class WorkMoves {
  private readonly work = inject(SelectedWork);
  private readonly pending = inject(PendingFinishes);
  private readonly moving = qitsMutation(MOVE_WORK);
  private readonly presses = qitsMutation(DISPATCH_WORK);

  /** Each entity's running or failed finish, by entity id. */
  readonly finishing = signal<Readonly<Record<string, FinishState>>>({});
  /** Each entity's running or failed `transition` (or `drop`), by entity id. */
  readonly transitioning = signal<Readonly<Record<string, FinishState>>>({});
  /** Why each entity's last `transition` failed, by entity id. */
  readonly refusals = signal<Readonly<Record<string, string>>>({});
  /** Each entity's running or failed `dispatch`, by entity id. */
  readonly dispatching = signal<Readonly<Record<string, FinishState>>>({});
  /** The phase each entity's last dispatch started, by entity id. */
  readonly dispatched = signal<Readonly<Record<string, string>>>({});

  /** The timer of each waiting finish, by entity id. */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const leave = () => void this.flushFinishes();
    globalThis.addEventListener('pagehide', leave);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener('pagehide', leave);
      for (const timer of this.timers.values()) clearTimeout(timer);
    });
  }

  /** Moves `entry` to `target` (a Status action); a running move is not repeated. */
  async transition(projectId: string, entry: WorkEntry, target: WorkStatus): Promise<void> {
    const id = entry.id;
    if (!id || this.transitioning()[id] === 'running') return;
    setIn(this.transitioning, id, 'running');
    setIn(this.refusals, id, undefined);
    const { status, refusal } = await this.move(projectId, entry, target);
    setIn(this.transitioning, id, status ? undefined : 'error');
    setIn(this.refusals, id, status ? undefined : refusal);
  }

  /** Moves every one of `entries` to `target`, all at once, each as `transition` does. */
  async transitionAll(
    projectId: string,
    entries: readonly WorkEntry[],
    target: WorkStatus,
  ): Promise<void> {
    await Promise.all(entries.map((entry) => this.transition(projectId, entry, target)));
  }

  /** The Drop action: moves `entry` to DROPPED with the outcome (and reference) it was given. */
  async drop(
    projectId: string,
    entry: WorkEntry,
    outcome: WorkOutcome,
    supersededBy?: string,
  ): Promise<{ readonly status?: WorkStatus; readonly refusal?: string }> {
    const id = entry.id;
    if (!id || this.transitioning()[id] === 'running') return {};
    setIn(this.transitioning, id, 'running');
    setIn(this.refusals, id, undefined);
    const result = await this.move(projectId, entry, 'DROPPED', { outcome, supersededBy });
    setIn(this.transitioning, id, result.status ? undefined : 'error');
    setIn(this.refusals, id, result.status ? undefined : result.refusal);
    return result;
  }

  /** Moves `entry` to DONE now. */
  async finish(projectId: string, entry: WorkEntry): Promise<void> {
    const id = entry.id;
    if (!id || this.finishing()[id] === 'running') return;
    setIn(this.finishing, id, 'running');
    const { status } = await this.move(projectId, entry, 'DONE');
    setIn(this.finishing, id, status ? undefined : 'error');
  }

  /** Hides `entry` and moves it to DONE after {@link FINISH_DELAY_MS}, unless undone first. */
  finishLater(projectId: string, entry: WorkEntry): void {
    const id = entry.id;
    const phase = id ? this.pending.all()[id]?.phase : undefined;
    if (!id || phase === 'waiting' || phase === 'sending') return;
    setIn(this.finishing, id, undefined);
    this.pending.set(id, { projectId, entry, phase: 'waiting' });
    this.timers.set(
      id,
      setTimeout(() => void this.send(id), FINISH_DELAY_MS),
    );
  }

  /** Takes a waiting finish back: the item shows again, and nothing is sent. */
  undoFinish(entityId: string): void {
    if (this.pending.all()[entityId]?.phase !== 'waiting') return;
    this.stopTimer(entityId);
    this.pending.set(entityId, undefined);
  }

  /** Forgets a failed finish. */
  dismissFinish(entityId: string): void {
    if (this.pending.all()[entityId]?.phase === 'failed') this.pending.set(entityId, undefined);
  }

  /** Sends every waiting finish now. */
  async flushFinishes(): Promise<void> {
    await Promise.all(Object.keys(this.pending.all()).map((id) => this.send(id)));
  }

  /** Presses dispatch for `entry`; a running press is not repeated. */
  async dispatch(entry: WorkEntry, mode: DispatchMode): Promise<void> {
    const id = entry.id;
    const qualifiedId = workRef(entry);
    if (!id || !qualifiedId || this.dispatching()[id] === 'running') return;
    setIn(this.dispatching, id, 'running');
    const data = await this.presses
      .run({ path: { qualifiedId }, body: { mode } })
      .catch(() => undefined);
    setIn(this.dispatching, id, data ? undefined : 'error');
    const phase = data && 'dispatch' in data ? data.dispatch?.phase : undefined;
    if (phase) setIn(this.dispatched, id, phase);
  }

  private stopTimer(entityId: string): void {
    clearTimeout(this.timers.get(entityId));
    this.timers.delete(entityId);
  }

  /** Sends the waiting finish of `entityId` now. */
  private async send(entityId: string): Promise<void> {
    this.stopTimer(entityId);
    const pending = this.pending.all()[entityId];
    if (pending?.phase !== 'waiting') return;
    this.pending.set(entityId, { ...pending, phase: 'sending' });
    await this.finish(pending.projectId, pending.entry);
    // The entry carries DONE before the pending finish goes, so the item never shows again.
    this.pending.set(
      entityId,
      this.finishing()[entityId] === 'error' ? { ...pending, phase: 'failed' } : undefined,
    );
  }

  /**
   * Moves an entity to `target` through the status door and writes the answered status into the
   * open project's work. The answered status, or why the move failed. `extra` carries a DROP move's
   * `outcome` and `supersededBy` (qits-248).
   */
  private async move(
    projectId: string,
    entry: WorkEntry,
    target: WorkStatus,
    extra?: Pick<DropMove, 'outcome' | 'supersededBy'>,
  ): Promise<{ readonly status?: WorkStatus; readonly refusal?: string }> {
    const id = entry.id;
    const qualifiedId = workRef(entry);
    if (!id || !qualifiedId) return {};
    const body: DropMove = { target, ...extra };
    try {
      // `keepalive`: a finish sent as the page is left must still arrive.
      const answer = await this.moving.run({ path: { qualifiedId }, body, keepalive: true });
      const status = answer?.status;
      if (!status) return { refusal: moveRefusal(undefined) };
      if (this.work.projectId() === projectId) this.work.put(id, status);
      return { status };
    } catch (error) {
      return { refusal: moveRefusal(error) };
    }
  }
}
