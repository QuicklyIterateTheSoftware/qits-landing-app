import { computed, Injectable, signal } from '@angular/core';
import type { PendingFinish } from './moves';

/**
 * The finishes the Acceptance list asked for and not settled yet, by entity id, oldest first
 * (qits-2146: `WorkStore.pendingFinishes`): UI state only, which `WorkMoves` writes and
 * `SelectedWork` (the items it leaves out) and `app-finish-toasts` read. It reads nothing.
 */
@Injectable({ providedIn: 'root' })
export class PendingFinishes {
  private readonly finishes = signal<Readonly<Record<string, PendingFinish>>>({});

  /** Each finish not settled yet, by entity id, oldest first. */
  readonly all = this.finishes.asReadonly();

  /** The ids of items the lists do not show: their finish is waiting or being sent. */
  readonly hidden = computed(
    () =>
      new Set(
        Object.entries(this.finishes()).flatMap(([id, p]) => (p.phase === 'failed' ? [] : [id])),
      ),
  );

  /** Sets or drops `entityId`'s finish; a finish already there keeps its place in the order. */
  set(entityId: string, value: PendingFinish | undefined): void {
    const { [entityId]: _, ...rest } = this.finishes();
    this.finishes.set(value ? { ...this.finishes(), [entityId]: value } : rest);
  }
}
