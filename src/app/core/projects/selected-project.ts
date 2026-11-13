import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, linkedSignal, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { qitsResource } from '@qits/angular';
import { filter, map } from 'rxjs';
import { loadState } from '$core/resources/load-state';
import type { LoadState } from '$ui/components/spinner/spinner';
import type { ListedProject } from './projects.consumes';
import { PROJECT_LIST } from './projects.operations';

/** The slug in a `/projects/<slug>` URL, or undefined for any other URL. */
export function projectSlugOf(url: string): string | undefined {
  const match = /^\/projects\/([^/?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * A project as the app keeps it: only the fields it reads (`projects.consumes.ts`), and an `id`,
 * which the spec leaves optional.
 */
export type Project = ListedProject & { readonly id: string };

const withId = (project: ListedProject | undefined): project is Project => !!project?.id;

/**
 * The project the URL names (`/projects/<slug>`), looked up in qits-projects' list. The URL is the
 * selection: opening a card navigates there, and the navigation and the project pages read it from
 * here.
 *
 * The list is this root service's own `qitsResource` over `PROJECT_LIST` (qits-2146; it was
 * a store's): the shell and every project page share it, one request. It is read once a URL
 * names a project, and kept from then on, in the browser only (the server render has no session to
 * send). The picker reads the list on its own, so a visit to the picker alone reads it once.
 *
 * Staleness (qits-1270): no event. qits-projects emits none for a project created, renamed or
 * deleted, so the list is read once.
 */
@Injectable({ providedIn: 'root' })
export class SelectedProject {
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

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

  /** Whether a URL has named a project yet: the list is read from then on, and kept. */
  private readonly wanted = linkedSignal<string | undefined, boolean>({
    source: this.slug,
    computation: (slug, previous) => (previous?.value ?? false) || slug !== undefined,
  });

  /** Every project, once a URL named one. */
  readonly projects = qitsResource(PROJECT_LIST, () =>
    this.browser && this.wanted() ? {} : undefined,
  );

  /** The projects the list holds, each with an id. */
  private readonly listed = computed((): readonly Project[] =>
    this.projects.hasValue()
      ? (this.projects.value()?.entries ?? []).map((entry) => entry.project).filter(withId)
      : [],
  );

  /** The list's read: loading until it answered, an error when it failed. */
  readonly listState = computed((): LoadState => loadState(this.projects));

  /** The selected project, once the list holds it. */
  readonly project = computed((): Project | undefined => {
    const slug = this.slug();
    return slug === undefined ? undefined : this.listed().find((p) => p.slug === slug);
  });
}
