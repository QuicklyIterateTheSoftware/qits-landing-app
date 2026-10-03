import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { DomainEvents } from '$core/events/domain-events';
import { ProjectsStore } from '$core/projects/projects.store';
import { WorkGraph } from './work-tree';
import { WorkStore } from './work.store';
import type { LoadState } from '$ui/components/spinner/spinner';
import { SelectedProject } from '$core/projects/selected-project';

/**
 * The open project's work, for the work section's pages: the same `WorkStore` answer the project
 * card counts from (one request per project, shared), loaded here if nothing asked for it yet.
 */
/** The event qits-projects announces for every status or shape change of work entities. */
export const WORK_EVENTS = ['EntityTransitioned'];

/** How long a burst of transitions waits before the work is fetched again. */
export const WORK_REFRESH_DEBOUNCE_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class SelectedWork {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(ProjectsStore);
  private readonly workStore = inject(WorkStore);
  private readonly events = inject(DomainEvents);

  /**
   * The open project's work entities; empty until they are loaded. An item whose finish waits for
   * its Undo, or is being sent, is left out (`WorkStore.hidden`): it has left its list already.
   */
  readonly entries = computed(() => {
    const hidden = this.workStore.hidden();
    const entries = this.work()?.entries ?? [];
    return hidden.size ? entries.filter((e) => !e.id || !hidden.has(e.id)) : entries;
  });

  /** The open project's work as a tree: phases, columns and spans (`work-tree.ts`). */
  readonly graph = computed(() => new WorkGraph(this.entries(), this.work()?.campaigns ?? {}));

  /** Loading until the project is known and its work answered; an error if either failed. */
  readonly state = computed((): LoadState => {
    if (this.store.status() === 'error') return 'error';
    const status = this.work()?.status;
    if (status === 'loaded' || status === 'error') return status;
    if (this.store.status() === 'loaded' && !this.selected.project()) return 'error';
    return 'loading';
  });

  private readonly work = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.workStore.byProject()[id] : undefined;
  });

  constructor() {
    // In the browser only: the server render has no session cookie to send. Only the project id
    // is tracked: `loadWork` reads the store's state, and tracking that would fetch without end.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.workStore.load(id));
    });
  }

  /**
   * Keeps the open project's work current while `destroy` lives: on `EntityTransitioned` (a finish
   * here or in another tab, or any agent's move), the work is fetched again, at most once a second.
   * Only the event's name is read, so nothing of its payload is relied on: the refetch is what
   * tells which items moved, and those leave the board with their animation.
   */
  followTransitions(destroy: DestroyRef): void {
    this.events
      .on(WORK_EVENTS)
      .pipe(debounceTime(WORK_REFRESH_DEBOUNCE_MS), takeUntilDestroyed(destroy))
      .subscribe(() => {
        const id = this.selected.project()?.id;
        if (id) void this.workStore.refresh(id);
      });
  }
}
