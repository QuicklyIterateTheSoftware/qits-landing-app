import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, Injectable, PLATFORM_ID, untracked } from '@angular/core';
import { ProjectsStore } from '../projects/projects.store';
import { WorkStore } from './work.store';
import type { LoadState } from '../../ui/components/spinner/spinner';
import { SelectedProject } from '../projects/selected-project';

/**
 * The open project's work, for the Work and Archive pages: the same `WorkStore` answer the project
 * card counts from (one request per project, shared), loaded here if nothing asked for it yet.
 */
@Injectable({ providedIn: 'root' })
export class SelectedWork {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(ProjectsStore);
  private readonly workStore = inject(WorkStore);

  /** The open project's work entities; empty until they are loaded. */
  readonly entries = computed(() => this.work()?.entries ?? []);

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
}
