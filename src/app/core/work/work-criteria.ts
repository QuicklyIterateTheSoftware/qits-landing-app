import { inject, Injectable, Injector } from '@angular/core';
import { loadState } from '$core/resources/load-state';
import { ResourceFamily } from '$core/resources/resource-family';
import { WORK_CRITERIA } from './work-detail.operations';

/** One item's acceptance criteria, as the Schedule tab shows them. */
export interface WorkCriteria {
  readonly status: 'loading' | 'loaded' | 'error';
  /** In order; empty while loading, after an error, and for an item that has none. */
  readonly items: readonly string[];
}

/**
 * Each work item's acceptance criteria, by qualified id (qits-2146, in place of
 * `WorkDetailStore.loadCriteria`): a root `ResourceFamily` over `WORK_CRITERIA` (`getWork`), one
 * read per item for the app's life, which the Schedule tab starts for each item it lists (the
 * project's work list does not carry them). `read(ref)` starts it (again after an error), outside a
 * reactive context; `of(ref)` gives them, or undefined before.
 *
 * Staleness (qits-1270): none. The criteria change only by an edit of the item, which qits-projects
 * does not announce; they are read once.
 */
@Injectable({ providedIn: 'root' })
export class WorkCriteriaReads {
  private readonly family = new ResourceFamily(WORK_CRITERIA, inject(Injector));

  /** Starts reading `ref`'s criteria, unless held; reads a failed one again (a 404 too). */
  read(ref: string): void {
    if (ref) this.family.read(ref, { path: { qualifiedId: ref } }, true);
  }

  /** `ref`'s criteria, once `read` started them. */
  of(ref: string): WorkCriteria | undefined {
    const read = this.family.get(ref);
    if (!read) return undefined;
    return {
      status: loadState(read),
      items: (read.hasValue() ? read.value()?.acceptanceCriteria : undefined) ?? [],
    };
  }
}
