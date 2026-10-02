import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ProjectsStore } from '../core/projects/projects.store';

/** The slug in a `/projects/<slug>` URL, or undefined for any other URL. */
export function projectSlugOf(url: string): string | undefined {
  const match = /^\/projects\/([^/?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * The project the URL names (`/projects/<slug>`), looked up in `ProjectsStore`'s list. The URL is
 * the selection: opening a card navigates there, and the navigation and the project page both read
 * it from here.
 */
@Injectable({ providedIn: 'root' })
export class SelectedProject {
  private readonly router = inject(Router);
  private readonly store = inject(ProjectsStore);

  /** The current URL, updated on every navigation. */
  readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The slug in the URL, or undefined when no project is selected. */
  readonly slug = computed(() => projectSlugOf(this.url()));

  /** The selected project, once the list holds it. */
  readonly project = computed(() => {
    const slug = this.slug();
    return slug === undefined ? undefined : this.store.entities().find((p) => p.slug === slug);
  });
}
