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
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, qitsResource } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { AGENT_TABS } from '$core/workspaces/agent-tabs';
import { ITEM_AGENTS } from '$core/workspaces/agents.operations';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * Where a work item's agent used to live, `/projects/<slug>/work/detail/<qualified id>/agent` and
 * its tabs (`…/agent/chat`, `/files`, `/terminal`), now that an agent's page is addressed by the
 * agent (`/projects/<slug>/agents/<agent id>`, epic qits-1681). It finds the item's ACTIVE agent
 * (its own `qitsResource` over `ITEM_AGENTS`, qits-2146: `listAgents?workId=` by the item's id
 * from `SelectedWork`) and goes to that agent's page on
 * the same tab, or to the item's page when it has none; either way replacing the old address in
 * the history, so Back skips it. The work item pages' Workspace links still lead here: they know
 * the item, not its agent.
 *
 * Where it leads is declared (`follow-work-item-agent`, epic qits-2000), with no trigger: `toAgent`
 * and one exit per tab (`toAgentChat`, `toAgentFiles`, `toAgentTerminal`), or `toItem`.
 *
 * A page rather than an async `redirectTo`: the server render has no session to read the agent
 * with, so it renders a spinner and the browser navigates. A layout only because the tab is a
 * child route (`:tab`), which renders nothing.
 */
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
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly following = outcomes(
    'follow-work-item-agent',
    {
      toAgent: exit('projects/:slug/agents/:agentId'),
      toAgentChat: exit('projects/:slug/agents/:agentId/chat'),
      toAgentFiles: exit('projects/:slug/agents/:agentId/files'),
      toAgentTerminal: exit('projects/:slug/agents/:agentId/terminal'),
      toItem: exit('projects/:slug/work/detail/:id'),
    },
    { triggered: false },
  );

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

  /** The item's agents, in the browser only, once its id is known. */
  private readonly itemAgents = qitsResource(ITEM_AGENTS, () => {
    const workId = this.workId();
    return this.browser && workId ? { query: { workId } } : undefined;
  });

  /**
   * Where to go: to the agent's page (on the tab asked for), to the item's page, or undefined while
   * that is not known yet.
   */
  private readonly target = computed((): (() => Promise<boolean>) | undefined => {
    const slug = this.selected.slug();
    if (!slug) return undefined;
    const replaceUrl = { replaceUrl: true };
    const item = () => this.following.toItem.go({ slug, id: this.qualifiedId }, replaceUrl);
    const state = this.work.state();
    if (state === 'error') return item;
    const workId = this.workId();
    if (!workId) return state === 'loaded' ? item : undefined;
    const read = this.itemAgents;
    if (read.status() !== 'error' && !read.hasValue()) return undefined;
    const agents = read.hasValue() ? (read.value()?.agents ?? []) : [];
    const agentId = agents.find((agent) => agent.state === 'ACTIVE')?.agentId;
    if (!agentId) return item;
    const params = { slug, agentId };
    switch (this.tab) {
      case 'chat':
        return () => this.following.toAgentChat.go(params, replaceUrl);
      case 'files':
        return () => this.following.toAgentFiles.go(params, replaceUrl);
      case 'terminal':
        return () => this.following.toAgentTerminal.go(params, replaceUrl);
      default:
        return () => this.following.toAgent.go(params, replaceUrl);
    }
  });

  constructor() {
    // The item's id comes from the project's work: read it (`SelectedWork` reads only once asked).
    this.work.want();
    if (!this.browser) return;
    let gone = false;
    effect(() => {
      const target = this.target();
      if (!target || gone) return;
      gone = true;
      untracked(() => void target());
    });
  }
}
