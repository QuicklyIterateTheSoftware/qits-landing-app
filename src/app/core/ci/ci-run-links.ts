import { computed, Injectable, inject } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';

/**
 * Every in-app link to a CI run (qits-2321): the run's page in the open project,
 * `/projects/<slug>/ci/runs/<runId>`, as the exit `open-ci-run:run`. The project's CI page, the
 * release request page's builds, lifecycle, automations and reports, the active-run chips (the
 * request's header and the lightning menu) and the run page's own links to other runs all lead
 * there through it, rendered with `QitsExit` (`[qitsExit]="runs.opening.run"` and
 * `[exitParams]="runs.params(runId)"`), so each link has a real `href`, a plain click records the
 * outcome and navigates through the router, and the trigger carries `data-qits-outcome`. The
 * declaration is app-wide, since this file is outside `routes/`.
 *
 * Root, because it holds only the declaration and the open project's slug. A run of a repository
 * outside the open project is still linked here: its page says it is not in this project.
 */
@Injectable({ providedIn: 'root' })
export class CiRunLinks {
  private readonly selected = inject(SelectedProject);

  /** A run's page. */
  readonly opening = outcomes('open-ci-run', { run: exit('projects/:slug/ci/runs/:runId') });

  /** The open project's slug; `''` before the URL names one. */
  readonly slug = computed(() => this.selected.slug() ?? '');

  /** The exit's params for `runId` in the open project (a run always carries its id). */
  params(runId: string | null | undefined): { readonly slug: string; readonly runId: string } {
    return { slug: this.slug(), runId: runId ?? '' };
  }

  /** The run's page as an absolute path, for a plain link (a `ui/` component's `href` input). */
  href(runId: string | null | undefined): string | undefined {
    const slug = this.slug();
    return slug && runId ? this.opening.run.url({ slug, runId }) : undefined;
  }
}
