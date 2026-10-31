import { inject, Injectable, signal } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { reorderAnchor, type ReorderIndexMove } from '$core/reorder/reorder-anchor';
import { workRef } from './work.store';
import type { WorkNode } from './work-tree';
import { WorkWritesStore } from './work-writes.store';

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
 * The drops of the open project's reorder lists (`WorkWritesStore.reprioritize`): the service
 * renumbers, and its answer orders the trees at once; a refusal reads the work again, so the item
 * goes back, and is kept in `refusal` for the page to show. One for the app, so a refusal from any
 * list (the roots', an epic's features', a feature's tasks') shows in one place.
 */
@Injectable({ providedIn: 'root' })
export class WorkReorders {
  private readonly writes = inject(WorkWritesStore);
  private readonly selected = inject(SelectedProject);
  private readonly refused = signal<string | undefined>(undefined);

  /** Why the last drop was refused, in the service's words; gone when the next one starts. */
  readonly refusal = this.refused.asReadonly();

  /** Sends `move` among `nodes` (the list's drawn items, in order) as an anchor; nothing for none. */
  move(nodes: readonly WorkNode[], move: WorkMove): void {
    const ids = nodes.map((node) => workRef(node.entry) ?? '');
    const moved = ids[move.from];
    const anchor = reorderAnchor(ids, move);
    const projectId = this.selected.project()?.id;
    if (!moved || !anchor || !projectId || !Object.values(anchor)[0]) return;
    this.refused.set(undefined);
    void this.writes.reprioritize(projectId, moved, anchor).then((outcome) => {
      if (!outcome.ok) this.refused.set(outcome.refusal);
    });
  }
}
