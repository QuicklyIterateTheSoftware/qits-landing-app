import { computed, inject, Injectable } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import type { WaitContext } from './agent-attention';

/**
 * The open project's context for an agent's waits and attention (`waitSubject`, `attentionAction`
 * in `agent-attention.ts`), shared by everything that draws them (qits-2146): the agents menu, the
 * Agents page's and the agent page's status lines (`app-agent-status`). It reads nothing itself; it
 * is what the app already holds: the open project's slug, qits-ci's page origin, the project's
 * release requests (`ProjectReleaseRequests`, read for the shell) and its work as `SelectedWork`'s
 * resource holds it, once a work page wanted it (`SelectedWork.want`), else none, and the wait's
 * last known state shows. It never asks for the work: a status line is no reason to read it.
 */
@Injectable({ providedIn: 'root' })
export class OpenProjectWaits {
  private readonly selected = inject(SelectedProject);
  private readonly releaseRequests = inject(ProjectReleaseRequests);
  private readonly work = inject(SelectedWork);
  private readonly origins = inject(PlatformOrigins);

  /** The open project's context, as `waitSubject` and `attentionAction` take it. */
  readonly context = computed((): WaitContext => ({
    slug: this.selected.slug() ?? '',
    ciOrigin: this.origins.page('ci') || undefined,
    releaseRequests: this.releaseRequests.requests(),
    work: this.work.loaded(),
  }));
}
