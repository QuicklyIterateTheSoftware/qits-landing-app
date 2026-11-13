import { itemMark, sourceMark } from '@qits/angular';
import { PROJECT_WORK } from './project-work.operations';
import type { WorkEntry } from './work.consumes';

/**
 * The data marks (qits-2141) of the work the boards, lists and rows draw (qits-2146). They draw
 * `WorkNode`s of `SelectedWork`'s graph, a root service's value that `qits/data-through-fields`
 * cannot trace, so the patterns write the marks as plain attributes, as the shell does for its
 * shared data: each card, lane or row element names its read (`data-qits-source`, `PROJECT_WORK`)
 * and its work item (`data-qits-item`, by `id`, as `QitsEntity` renders them); each value its field
 * (`data-qits-field`) or the fields it is computed from (`data-qits-derived`), as `QitsField` does;
 * a list of items names its read only, as `QitsEntityList` does.
 */
export const WORK_SOURCE = sourceMark(PROJECT_WORK);

/** A work item's `data-qits-item`: `id=<its id>`, or none without an id. */
export function workItem(entry: Pick<WorkEntry, 'id'>): string | null {
  return itemMark('id', entry.id);
}

/** What a pattern binds: the source and the item mark function. */
export const WORK_MARKS = { source: WORK_SOURCE, item: workItem } as const;
