import { inject, Injectable, signal } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { workRef } from './work.store';
import type { WorkNode } from './work-tree';
import { WorkWritesStore, type WorkAnchor } from './work-writes.store';

/**
 * Prioritising work by dragging it (qits-753): in the Backlog, the roots, an epic's features and a
 * feature's tasks are each a list of their own; on the board, the top-level epics and tickets.
 */

/** A list's move: the item's index among the list's drawn items before it, and after it. */
export interface WorkMove {
  readonly from: number;
  readonly to: number;
}

/**
 * Where the item moved in `move` sits after it, among `ids` (the list's drawn items, in order,
 * before the move): directly above the item now below it, or, moved to the end, directly below the
 * item now above it. None for no move (`from === to`), an index outside the list, or a list of one.
 */
export function reorderAnchor(ids: readonly string[], move: WorkMove): WorkAnchor | undefined {
  const { from, to } = move;
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return undefined;
  const after = ids.filter((_, index) => index !== from);
  after.splice(to, 0, ids[from]);
  if (to + 1 < after.length) return { above: after[to + 1] };
  return to > 0 ? { below: after[to - 1] } : undefined;
}

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
