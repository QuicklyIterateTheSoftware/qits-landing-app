import { inject, Injectable, signal } from '@angular/core';
import { qitsMutation } from '@qits/angular';
import { reorderAnchor, type ReorderIndexMove } from '$core/reorder/reorder-anchor';
import { workRef } from './moves';
import { SelectedWork } from './selected-work';
import type { WorkNode } from './work-tree';
import { reprioritizeParams, workWriteRunRefusal } from './work-writes';
import { REPRIORITIZE_WORK } from './work-writes.operations';

/**
 * Prioritising work by dragging it (qits-753): in the Backlog, the roots, an epic's features and a
 * feature's tasks are each a list of their own; on the board, the top-level epics and tickets.
 */

/** A list's move: the item's index among the list's drawn items before it, and after it. */
export type WorkMove = ReorderIndexMove;

/** The shared index-to-anchor translation, here for the work lists' callers. */
export { reorderAnchor };

/**
 * Whether `node` can be dragged: an item of the list's own phase (not context) that is still open
 * (qits-projects refuses a priority on a DONE or DROPPED item).
 */
export function movable(node: WorkNode): boolean {
  const status = node.entry.status;
  return !node.context && status !== 'DONE' && status !== 'DROPPED';
}

/**
 * The drops of the open project's reorder lists, through `qitsMutation(REPRIORITIZE_WORK)`
 * (`reprioritizeWork`, qits-2146): the service renumbers, and its answered priorities go into the
 * open project's work at once (`SelectedWork.putPriorities`), so the item stays where it was
 * dropped; a refusal (400 for an anchor that is no open sibling, 409 for a DONE or DROPPED item)
 * reads the work again (`SelectedWork.reload`), so the item goes back, and is kept in `refusal` for
 * the page to show. One for the app, so a refusal from any list (the roots', an epic's features', a
 * feature's tasks') shows in one place.
 *
 * Staleness (qits-1270): no event follows a priority change, so the drop's own answer is the update.
 */
@Injectable({ providedIn: 'root' })
export class WorkReorders {
  private readonly work = inject(SelectedWork);
  private readonly reprioritize = qitsMutation(REPRIORITIZE_WORK);
  private readonly refused = signal<string | undefined>(undefined);

  /** Why the last drop was refused, in the service's words; gone when the next one starts. */
  readonly refusal = this.refused.asReadonly();

  /** Sends `move` among `nodes` (the list's drawn items, in order) as an anchor; nothing for none. */
  move(nodes: readonly WorkNode[], move: WorkMove): void {
    const ids = nodes.map((node) => workRef(node.entry) ?? '');
    const moved = ids[move.from];
    const anchor = reorderAnchor(ids, move);
    if (!moved || !anchor || !this.work.projectId() || !Object.values(anchor)[0]) return;
    this.refused.set(undefined);
    this.reprioritize.run(reprioritizeParams(moved, anchor)).then(
      (answer) => this.work.putPriorities(answer?.items ?? []),
      (error: unknown) => {
        this.work.reload();
        this.refused.set(workWriteRunRefusal(error));
      },
    );
  }
}
