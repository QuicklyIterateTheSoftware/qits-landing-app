import { computed, Injectable, inject } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';

/**
 * Every in-app link to a repository's maintenance page (qits-2334): the repository page in the
 * open project, `/projects/<slug>/maintenance/repositories/<name>`, as the exit
 * `open-maintenance-repository:repository`. The Dependencies page's pins, the Artifacts page's
 * producing repository and dependents, the bump page's repository, the adoption page's adopters
 * (qits-2333) and the repository page's own dependents and downstream lead there through it, rendered with `QitsExit`
 * (`[qitsExit]="repositoryLinks.opening.repository"` and
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

  /** A repository's maintenance page. */
  readonly opening = outcomes('open-maintenance-repository', {
    repository: exit('projects/:slug/maintenance/repositories/:name'),
  });

  /** The open project's slug; `''` before the URL names one. */
  readonly slug = computed(() => this.selected.slug() ?? '');

  /** The exit's params for the repository `name` in the open project. */
  params(name: string | null | undefined): { readonly slug: string; readonly name: string } {
    return { slug: this.slug(), name: name ?? '' };
  }
}
