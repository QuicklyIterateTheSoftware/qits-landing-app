import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { activityLabel, agentWaitLabel, runStateLabel } from '$core/workspaces/agent-labels';
import { AGENT_TABS } from '$core/workspaces/agent-tabs';
import { workItemPath } from '$core/workspaces/agent-attention';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentStatus } from '$patterns/agents/agent-status/agent-status';
import { AgentDiscard } from '$patterns/workspaces/agent-discard/agent-discard';
import { AgentRunActions } from '$patterns/workspaces/agent-run-actions/agent-run-actions';
import { StartingLog } from '$patterns/workspaces/starting-log/starting-log';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * One agent, at `/projects/<slug>/agents/<agent id>` (epic qits-1681, before it epic qits-1230's
 * `work/detail/<qualified id>/agent`, which now leads here): where the Agents page, the agents menu
 * and a slot's page lead. The header: the agent's item, linked to the item's page, and its title;
 * how it runs (its lifecycle and run state, what it is doing); what it waits on (qits-1229; "waiting
 * on you" only when a person is awaited) with a line per open wait and, when it needs a person, why
 * and what to do (`app-agent-status`); its branch; its verbs (`app-agent-run-actions`, epic
 * qits-1667: Interrupt while it runs, Stop unless it is stopped, Restart while it runs, is yielded
 * or stopped, the last two confirmed; by the agent, never by its slot); Discard
 * (`app-agent-discard`: confirmed, and with force after the service refused); and a **Workspace** field — `ws-<slot id>`, a link to the slot's
 * page, where its container's status and verbs are (epic qits-1667: the agent page asks nothing of
 * the slot) — and the log of the start bringing the slot's container up while one runs
 * (`getAgentActiveProcess`, by the agent). After a verb or a discard the agent is read again.
 *
 * A layout: the agent's tabs (`AGENT_TABS`: `chat`, `files` and `terminal`) are its child routes,
 * in a row of links below the header, shown once the agent is known; the empty child shows the
 * header alone.
 *
 * The agent comes from `AgentsStore.loadAgent` by the URL's `:agentId` (`getAgent`, in any state);
 * its open waits and attention from the project's ACTIVE agents (`AgentsStore.loadProjectAgents`),
 * which `getAgent` does not carry. In the browser only.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the agent and its start (`AgentsStore.loadAgent`, quietly, at most once a
 * second). `AGENT_STATUS_EVENTS` about the project → its waits and attention
 * (`AgentsStore.followProject`). Not announced (see `AgentsStore`): the slot's container stopping.
 */
@Component({
  selector: 'app-agent-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgentDiscard,
    AgentRunActions,
    AgentStatus,
    Chip,
    PageLayoutComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    Spinner,
    StartingLog,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()">
        <ui-spinner [state]="spinnerState()" class="min-h-48">
          <p class="m-0 text-sm text-charcoal-brown-600" [class.hidden]="state() !== 'missing'">
            No agent {{ agentId() }}.
          </p>
          @if (agent(); as agent) {
            <div class="flex flex-col gap-6">
              <section class="flex flex-col gap-2 text-sm" aria-label="Agent">
                @if (agent.entityId || agent.entityTitle) {
                  <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-base">
                    @if (itemLink(); as link) {
                      <a
                        class="font-semibold text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="link"
                        >{{ agent.entityId }}</a
                      >
                    }
                    @if (agent.entityTitle; as title) {
                      <span class="text-charcoal-brown-900">{{ title }}</span>
                    }
                  </p>
                }
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-charcoal-brown-600">
                  <ui-chip
                    [label]="(agent.state ?? 'unknown').toLowerCase()"
                    [tone]="stateTone()"
                  />
                  <span>{{ runState() }}</span>
                  @if (doing(); as doing) {
                    <span aria-hidden="true">·</span>
                    <span
                      [class.font-semibold]="doing === 'waiting on you'"
                      [class.text-cinnabar-700]="doing === 'waiting on you'"
                      >{{ doing }}</span
                    >
                  }
                  @if (agent.entityStatus; as status) {
                    <span aria-hidden="true">·</span>
                    <span>item {{ status.toLowerCase() }}</span>
                  }
                  @if (agent.entityBlocked) {
                    <ui-chip label="blocked" tone="waiting" />
                  }
                  @if (agent.harness; as harness) {
                    <span aria-hidden="true">·</span>
                    <span>{{ harness.toLowerCase() }}</span>
                  }
                  @if (agent.admin) {
                    <ui-chip label="docker socket" tone="waiting" />
                  }
                </div>
                @if (wait(); as wait) {
                  <p class="m-0 text-sunflower-gold-800" role="status">{{ wait }}</p>
                }
                @if (status(); as status) {
                  <app-agent-status [agent]="status" />
                }
                @if (agent.wrapperBranch; as branch) {
                  <p class="m-0 flex items-center gap-2 text-charcoal-brown-600">
                    <span class="font-semibold text-charcoal-brown-700">Branch</span>
                    <code class="font-mono text-xs">{{ branch }}</code>
                  </p>
                }
                @if (agent.agentId && agent.state !== 'REMOVED') {
                  <div class="flex flex-wrap items-start gap-2">
                    <app-agent-run-actions
                      [agentId]="agent.agentId"
                      [runState]="agent.runState"
                      (changed)="reload()"
                    />
                    <app-agent-discard [agentId]="agent.agentId" (discarded)="reload()" />
                  </div>
                }
              </section>

              <section class="flex flex-col gap-3" aria-labelledby="agent-workspace">
                <h2
                  id="agent-workspace"
                  class="m-0 text-base font-semibold text-charcoal-brown-900"
                >
                  Workspace
                </h2>
                @if (agent.workspaceRowId; as rowId) {
                  <p
                    class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm text-charcoal-brown-600"
                  >
                    <a
                      class="font-mono text-ocean-deep-700 no-underline hover:underline"
                      [routerLink]="slotLink(rowId)"
                      >ws-{{ rowId }}</a
                    >
                    <span
                      >its container, and the agents it hosts, are on the workspace’s page.</span
                    >
                  </p>
                } @else if (agent.state !== 'REMOVED') {
                  <p class="m-0 text-sm text-charcoal-brown-600">
                    No workspace yet: the agent waits for a free slot.
                  </p>
                }
              </section>

              @if (processId(); as processId) {
                <app-starting-log [processId]="processId" />
              }
            </div>
          }
        </ui-spinner>
        @if (agent()) {
          <nav class="mt-8" aria-label="Agent">
            <ul class="m-0 flex list-none gap-1 overflow-x-auto border-b border-gray-200 p-0">
              @for (tab of tabs; track tab.segment) {
                <li class="shrink-0">
                  <a
                    class="-mb-px flex items-center border-b-2 border-transparent px-3 py-2 text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900 aria-[current=page]:border-charcoal-brown-900 aria-[current=page]:font-semibold aria-[current=page]:text-charcoal-brown-900"
                    [routerLink]="tab.segment"
                    routerLinkActive=""
                    ariaCurrentWhenActive="page"
                    >{{ tab.label }}</a
                  >
                </li>
              }
            </ul>
          </nav>
          <div class="pt-4"><router-outlet /></div>
        }
      </app-page-layout>
    </div>
  `,
})
export class AgentLayout {
  protected readonly tabs = AGENT_TABS;
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(AgentsStore);

  /** The agent's id in the URL. */
  protected readonly agentId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('agentId') ?? '')),
    { initialValue: '' },
  );

  private readonly read = computed(() => {
    const id = this.agentId();
    return id ? this.store.agentOf(id) : undefined;
  });

  protected readonly agent = computed(() => this.read()?.agent);

  /** The agent as the project's ACTIVE list holds it: its open waits and its attention. */
  protected readonly status = computed(() => {
    const id = this.selected.project()?.id;
    const agentId = this.agentId();
    if (!id || !agentId) return undefined;
    return this.store.projectAgentsOf(id)?.agents.find((a) => a.agentId === agentId);
  });

  /** The start bringing the agent's slot's container up, while one is live. */
  protected readonly processId = computed(() => this.read()?.processId ?? null);

  protected readonly title = computed(() => {
    const item = this.agent()?.entityId;
    return item ? `Agent ${item}` : 'Agent';
  });

  /** The agent's work item's page. */
  protected readonly itemLink = computed(() => {
    const slug = this.selected.slug();
    const item = this.agent()?.entityId;
    return slug && item ? workItemPath(slug, item) : null;
  });

  protected readonly runState = computed(() => {
    const agent = this.agent();
    return agent ? runStateLabel(agent) : '';
  });

  protected readonly doing = computed(() => {
    const agent = this.agent();
    return agent ? activityLabel(agent.activity, agent.waitingOn) : null;
  });

  protected readonly wait = computed(() => {
    const agent = this.agent();
    return agent ? agentWaitLabel(agent) : null;
  });

  protected readonly stateTone = computed((): ChipTone =>
    this.agent()?.state === 'ACTIVE' ? 'ok' : 'neutral',
  );

  /** The read's state: `missing` when the service does not know the agent. */
  protected readonly state = computed((): LoadState | 'missing' => {
    const status = this.read()?.status;
    if (status === 'loaded' || status === 'error' || status === 'missing') return status;
    return 'loading';
  });

  /** The spinner's state: a missing agent is a loaded page that says so. */
  protected readonly spinnerState = computed((): LoadState => {
    const state = this.state();
    return state === 'missing' ? 'loaded' : state;
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const destroy = inject(DestroyRef);
    effect(() => {
      const id = this.agentId();
      if (id) untracked(() => void this.store.loadAgent(id));
    });
    effect(() => {
      const id = this.selected.project()?.id;
      if (id) untracked(() => void this.store.loadProjectAgents(id));
    });
    this.store.followProject(destroy, () => this.selected.project()?.id);
    this.store.follow(
      destroy,
      () => ({
        agentId: this.agentId() || undefined,
        workspaceId: this.agent()?.workspaceRowId?.toString(),
      }),
      () => this.reload(),
    );
  }

  /** Reads the agent again (after a lifecycle event, a discard, an agent verb). */
  protected reload(): void {
    const id = this.agentId();
    if (id) void this.store.loadAgent(id);
  }

  protected slotLink(rowId: number): string {
    return `/projects/${this.selected.slug() ?? ''}/workspaces/${rowId}`;
  }
}
