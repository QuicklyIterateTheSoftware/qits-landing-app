import { computed, Injectable, inject } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';

/**
 * Every in-app link to a repository's Depends on page (qits-2334; under the repository since
 * qits-2489): `/projects/<slug>/components/<name>/depends-on` in the open project, as the exit
 * `open-repository-depends-on:repository`. The bump page's repository, the adoption page's
 * adopters (qits-2333) and the Dependents page's dependents and downstream lead there through it,
 * rendered with `QitsExit` (`[qitsExit]="repositoryLinks.opening.repository"` and
 * `[exitParams]="repositoryLinks.params(name)"`), so each link has a real `href`, a plain click
 * records the outcome and navigates through the router, and the trigger carries
 * `data-qits-outcome`. The declaration is app-wide, since this file is outside `routes/`.
 *
 * Keyed by the repository's name (`qits-ci-service`, as the inventory names it), never filtered by
 * project: the name is the whole address, and an unknown one says so on its page.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceRepositoryLinks {
  private readonly selected = inject(SelectedProject);

  /** A repository's Depends on page. */
  readonly opening = outcomes('open-repository-depends-on', {
    repository: exit('projects/:slug/components/:repo/depends-on'),
  });

  /** The open project's slug; `''` before the URL names one. */
  readonly slug = computed(() => this.selected.slug() ?? '');

  /** The exit's params for the repository `name` in the open project. */
  params(name: string | null | undefined): { readonly slug: string; readonly repo: string } {
    return { slug: this.slug(), repo: name ?? '' };
  }
}
