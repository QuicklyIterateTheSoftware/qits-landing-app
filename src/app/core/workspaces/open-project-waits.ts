import { computed, inject, Injectable } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkStore } from '$core/work/work.store';
import type { WaitContext } from './agent-attention';

/**
 * The open project's context for an agent's waits and attention (`waitSubject`, `attentionAction`
 * in `agent-attention.ts`), shared by everything that draws them (qits-2146): the agents menu, the
 * Agents page's and the agent page's status lines (`app-agent-status`). It reads nothing itself; it
 * is what the app already holds: the open project's slug, qits-ci's page origin, the project's
 * release requests (`ProjectReleaseRequests`, read for the shell) and its work as `WorkStore` holds
 * it, when something has read it (the work pages, the project card), else none, and the wait's last
 * known state shows.
 *
 * TEMPORARY (qits-2146): the work comes from `WorkStore` as it stands, read but never loaded here,
 * until the work group moves it to a resource (`SelectedWork`); then this reads that instead. It is
 * the one place the agents' status lines still reach a store.
 */
@Injectable({ providedIn: 'root' })
export class OpenProjectWaits {
  private readonly selected = inject(SelectedProject);
  private readonly releaseRequests = inject(ProjectReleaseRequests);
  private readonly work = inject(WorkStore);
  private readonly origins = inject(PlatformOrigins);

  /** The open project's context, as `waitSubject` and `attentionAction` take it. */
  readonly context = computed((): WaitContext => {
    const id = this.selected.project()?.id;
    return {
      slug: this.selected.slug() ?? '',
      ciOrigin: this.origins.page('ci') || undefined,
      releaseRequests: this.releaseRequests.requests(),
      work: (id === undefined ? undefined : this.work.byProject()[id]?.entries) ?? [],
    };
  });
}
