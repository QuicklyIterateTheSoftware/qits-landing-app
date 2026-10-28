import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { agentPath, workItemPath } from '$core/workspaces/agent-attention';
import { AGENT_TABS } from '$core/workspaces/agent-tabs';
import { AgentsStore } from '$core/workspaces/agents.store';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * Where a work item's agent used to live, `/projects/<slug>/work/detail/<qualified id>/agent` and
 * its tabs (`…/agent/chat`, `/files`, `/terminal`), now that an agent's page is addressed by the
 * agent (`/projects/<slug>/agents/<agent id>`, epic qits-1681). It finds the item's ACTIVE agent
 * (`AgentsStore.loadItem`, by the item's id from `SelectedWork`) and goes to that agent's page on
 * the same tab, or to the item's page when it has none; either way replacing the old address in
 * the history, so Back skips it. The work item pages' Workspace links still lead here: they know
 * the item, not its agent.
 *
 * A page rather than an async `redirectTo`: the server render has no session to read the agent
 * with, so it renders a spinner and the browser navigates. A layout only because the tab is a
 * child route (`:tab`), which renders nothing.
 */
// eslint-disable-next-line qits/page-has-screenshots -- a redirect: it shows a spinner, then leaves.
@Component({
  selector: 'app-work-agent-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <ui-spinner state="loading" class="min-h-48" />
    </div>
  `,
})
export class WorkAgentLayout {
  private readonly selected = inject(SelectedProject);
  private readonly work = inject(SelectedWork);
  private readonly store = inject(AgentsStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The item's qualified id, and the tab asked for (one of `AGENT_TABS`, else none). */
  private readonly qualifiedId = this.route.snapshot.paramMap.get('id') ?? '';
  private readonly tab = AGENT_TABS.some(
    (t) => t.segment === this.route.snapshot.firstChild?.paramMap.get('tab'),
  )
    ? (this.route.snapshot.firstChild?.paramMap.get('tab') ?? undefined)
    : undefined;

  /** The item's id (qits-projects' entity id), once the project's work is loaded. */
  private readonly workId = computed(
    () => this.work.entries().find((e) => e.qualifiedId === this.qualifiedId)?.id,
  );

  /** Where to go: the agent's page, the item's page, or undefined while that is not known yet. */
  readonly target = computed((): string | undefined => {
    const slug = this.selected.slug();
    if (!slug) return undefined;
    const item = workItemPath(slug, this.qualifiedId);
    const state = this.work.state();
    if (state === 'error') return item;
    const workId = this.workId();
    if (!workId) return state === 'loaded' ? item : undefined;
    const read = this.store.itemOf(workId);
    if (!read || read.status === 'loading') return undefined;
    const agentId = read.agent?.agentId;
    return agentId ? agentPath(slug, agentId, this.tab) : item;
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.workId();
      if (id) untracked(() => void this.store.loadItem(id));
    });
    let gone = false;
    effect(() => {
      const target = this.target();
      if (!target || gone) return;
      gone = true;
      untracked(() => void this.router.navigateByUrl(target, { replaceUrl: true }));
    });
  }
}
