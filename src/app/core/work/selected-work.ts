import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  type DestroyRef,
  effect,
  Injector,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { qitsResource } from '@qits/angular';
import { injectRefreshOn, REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';
import { loadState } from '$core/resources/load-state';
import { owedReload } from '$core/resources/owed-reload';
import { SelectedProject } from '$core/projects/selected-project';
import type { LoadState } from '$ui/components/spinner/spinner';
import { PendingFinishes } from './pending-finishes';
import { PROJECT_WORK } from './project-work.operations';
import type { WorkEntry } from './work.consumes';
import { WorkGraph, withoutHidden } from './work-tree';

/** The event qits-projects announces for every status or shape change of work entities. */
export const WORK_EVENTS = ['EntityTransitioned'];

/** qits-projects' event for a new comment; it names the item as `entityId` (qits-1660). */
export const COMMENT_EVENTS = ['EntityCommented'];

/** How long a burst of transitions waits before the work is fetched again. */
export const WORK_REFRESH_DEBOUNCE_MS = REFRESH_DEBOUNCE_MS;

/**
 * The open project's work, for the work section's pages (qits-2146, in place of `WorkStore`): one
 * root `qitsResource` over `PROJECT_WORK` (`listProjectWork`, the whole planning tree), one request
 * per project however many pages, cards and lines read it, so moving between the pages fetches
 * nothing. It reads in the browser only (the server render holds no token to send), and only once
 * something wants the work (`want()`: the work pages, the work item page and its agent page);
 * `OpenProjectWaits` reads what it holds without asking for it, as it read `WorkStore`.
 *
 * Moves write the answered status into the read at once (`put`, `WorkMoves`), a drop the answered
 * priorities (`putPriorities`, `WorkReorders`): a local value, which also drops a read on its way,
 * so an answer that left before the move cannot undo it (qits-1223). An item whose finish waits for
 * its Undo, or is being sent, is left out of {@link entries} (`PendingFinishes.hidden`), and so is
 * everything below it (`withoutHidden`): it has left its list already.
 *
 * Staleness (qits-1270): `followTransitions(destroy)`, while a page following it lives:
 * `EntityTransitioned` whose `entities[].projectId` names the open project → the work
 * (`resource.reload()`), at most once a second, and once more after a read still on its way (as
 * `WorkStore.refresh` queued one, qits-1684). Not the resource's own `refreshOn`: the resource is the
 * app's (`OpenProjectWaits` reads it from the shell), and its events are wanted only while a work
 * page shows. Its needs (epic qits-1899) are met or not by the needed item's status, which moves by
 * the same event, so the "needs" badges follow it. qits-projects sends no event for a work item
 * created, edited (its needs included), deleted, reshaped or blocked: those reach the lists on the
 * next read (`reload()` after the page's own write).
 */
@Injectable({ providedIn: 'root' })
export class SelectedWork {
  private readonly selected = inject(SelectedProject);
  private readonly pending = inject(PendingFinishes);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly refreshOn = injectRefreshOn();
  private readonly injector = inject(Injector);
  private readonly wanted = signal(false);

  /** The open project's id, once the work is wanted, in the browser only: the read waits for it. */
  readonly projectId = computed(() =>
    this.browser && this.wanted() ? this.selected.project()?.id : undefined,
  );

  /** The open project's work. */
  readonly resource = qitsResource(PROJECT_WORK, () => {
    const project = this.projectId();
    return project ? { path: { project } } : undefined;
  });

  /** The work as read, or none: what `OpenProjectWaits` matches a wait's item in. */
  readonly loaded = computed((): readonly WorkEntry[] =>
    this.resource.hasValue() ? (this.resource.value()?.entities ?? []) : [],
  );

  /** The open project's work entities without the finishes waiting or sent; empty until read. */
  readonly entries = computed(() => withoutHidden(this.loaded(), this.pending.hidden()));

  /** The open project's work as a tree: phases, columns and spans (`work-tree.ts`). */
  readonly graph = computed(() => new WorkGraph(this.entries()));

  /** Loading until the project is known and its work answered; an error if either failed. */
  readonly state = computed((): LoadState => {
    const list = this.selected.listState();
    if (list === 'error') return 'error';
    const work = loadState(this.resource);
    if (work !== 'loading') return work;
    if (list === 'loaded' && !this.selected.project()) return 'error';
    return 'loading';
  });

  /** Reads the open project's work from now on (the work pages call it as they open). */
  want(): void {
    this.wanted.set(true);
  }

  /** Reads the work again; a read on its way gets one more after it (qits-1684). */
  readonly reload = owedReload(this.resource);

  /**
   * Reads the work again and settles once that read has answered (or failed): the create form waits
   * for it before it opens the new item's page, as it awaited `WorkStore.refresh`. Work nobody
   * wanted yet is read now (`want`), as `WorkStore.refresh` read it.
   */
  refreshed(): Promise<void> {
    const read = untracked(this.wanted);
    this.want();
    if (!this.browser || !untracked(this.selected.project)) return Promise.resolve();
    // Wanted only now, the first read is the read again.
    if (read) this.reload();
    return new Promise((resolve) => {
      const watch = effect(
        () => {
          if (this.resource.status() === 'idle' || this.resource.isLoading()) return;
          watch.destroy();
          resolve();
        },
        { injector: this.injector },
      );
    });
  }

  /**
   * Keeps the open project's work current while `destroy` lives: on `EntityTransitioned` naming
   * the open project in one of its `entities[].projectId`, the work is read again, at most once a
   * second. Nothing else of the payload is relied on: the read is what tells which items moved.
   */
  followTransitions(destroy: DestroyRef): void {
    this.want();
    this.refreshOn(
      {
        names: WORK_EVENTS,
        debounceMs: WORK_REFRESH_DEBOUNCE_MS,
        when: (_, ids) => {
          const id = this.selected.project()?.id;
          return !!id && ids.projectIds.includes(id);
        },
        refresh: () => this.reload(),
      },
      destroy,
    );
  }

  /** Writes `status` into the entry with the id `id`, as a move answered it. */
  put(id: string, status: string): void {
    this.resource.update(
      (work) =>
        work && {
          ...work,
          entities: work.entities?.map((e) => (e.id === id ? { ...e, status } : e)),
        },
    );
  }

  /** Writes each item's answered priority into its entry, found by qualified id (qits-753). */
  putPriorities(
    items: readonly { readonly qualifiedId?: string; readonly priority?: number }[],
  ): void {
    const priorities = new Map(
      items.flatMap((item) => (item.qualifiedId ? [[item.qualifiedId, item.priority]] : [])),
    );
    if (!priorities.size) return;
    this.resource.update(
      (work) =>
        work && {
          ...work,
          entities: work.entities?.map((e) =>
            e.qualifiedId && priorities.has(e.qualifiedId)
              ? { ...e, priority: priorities.get(e.qualifiedId) }
              : e,
          ),
        },
    );
  }
}
