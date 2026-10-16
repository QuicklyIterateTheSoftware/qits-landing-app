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
import { SelectedWork } from '$core/work/selected-work';
import { activityLabel, agentWaitLabel, runStateLabel } from '$core/workspaces/agent-labels';
import { AGENT_TABS } from '$core/workspaces/agent-tabs';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentDiscard } from '$patterns/workspaces/agent-discard/agent-discard';
import { ContainerActions } from '$patterns/workspaces/container-actions/container-actions';
import { SlotStatus } from '$patterns/workspaces/slot-status/slot-status';
import { StartingLog } from '$patterns/workspaces/starting-log/starting-log';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * A work item's agent, at `/projects/<slug>/work/detail/<qualified id>/agent` (epic qits-1230):
 * where the item's Workspace links lead, ported from qits-workspaces-frontend's agent page. What the
 * agent works on, how it runs (its lifecycle and run state, what it is
 * doing), what it waits on and since when (qits-1229; "waiting on you" only when a person is
 * awaited), its branch, Discard (`app-agent-discard`: confirmed, and with force after the service
 * refused), and its slot — a link to the slot's page, its status strip and its container's verbs
 * (`app-container-actions`) — with the log of the start bringing the slot's container up while one
 * runs. After a discard or a container verb the agent is read again.
 *
 * A layout: the agent’s tabs (`AGENT_TABS`: `chat`, `files` and `terminal`) are its child
 * routes, in a row of links below the header, shown once the agent is known; the empty child shows
 * the header alone.
 *
 * The item comes from the project's work (`SelectedWork`, by the URL's qualified id), its agent
 * from `AgentsStore.loadItem` by the item's id: its newest agent that is not removed. Read again
 * after a lifecycle event about the item, its agent or its slot (at most once a second). In the
 * browser only.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming the item (`workId`), its agent (`agentId`) or
 * its slot (`workspaceId`) → the item's agents and its slot's status (`AgentsStore.loadItem`,
 * quietly). The item comes from `SelectedWork` (`EntityTransitioned`, its own mapping). Not
 * announced (see `AgentsStore`): what the agent is doing and what it waits on (`activity`,
 * `waitingOn`: the daemon's hooks write them, no event), the slot's container stopping.
 */
@Component({
  selector: 'app-work-agent-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgentDiscard,
    Chip,
    ContainerActions,
    PageLayoutComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SlotStatus,
    Spinner,
    StartingLog,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()">
        <ui-spinner [state]="state()" class="min-h-48">
          <p
            class="m-0 text-sm text-charcoal-brown-600"
            [class.hidden]="state() !== 'loaded' || !!agent()"
          >
            No agent works on {{ id() }}.
          </p>
          @if (agent(); as agent) {
            <div class="flex flex-col gap-6">
              <section class="flex flex-col gap-2 text-sm" aria-label="Agent">
                @if (agent.entityTitle; as title) {
                  <p class="m-0 text-base text-charcoal-brown-900">{{ title }}</p>
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
                @if (agent.wrapperBranch; as branch) {
                  <p class="m-0 flex items-center gap-2 text-charcoal-brown-600">
                    <span class="font-semibold text-charcoal-brown-700">Branch</span>
                    <code class="font-mono text-xs">{{ branch }}</code>
                  </p>
                }
                @if (agent.agentId && agent.state !== 'REMOVED') {
                  <app-agent-discard [agentId]="agent.agentId" (discarded)="reload()" />
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
                  <a
                    class="self-start font-mono text-sm text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="slotLink(rowId)"
                    >{{ slot()?.workspaceId ?? 'ws-' + rowId }}</a
                  >
                  @if (slot(); as slot) {
                    <app-slot-status [slot]="slot" />
                    <app-container-actions [slot]="slot" (changed)="reload()" />
                  }
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
export class WorkAgentLayout {
  protected readonly tabs = AGENT_TABS;
  private readonly selected = inject(SelectedProject);
  private readonly work = inject(SelectedWork);
  private readonly store = inject(AgentsStore);

  /** The work item's qualified id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  /** The item's id (qits-projects' entity id), once the project's work is loaded. */
  private readonly workId = computed(
    () => this.work.entries().find((e) => e.qualifiedId === this.id())?.id,
  );

  private readonly read = computed(() => {
    const id = this.workId();
    return id ? this.store.itemOf(id) : undefined;
  });

  protected readonly agent = computed(() => this.read()?.agent);

  private readonly slotStatus = computed(() => {
    const rowId = this.agent()?.workspaceRowId;
    return rowId ? this.store.slotOf(rowId) : undefined;
  });

  protected readonly slot = computed(() => this.slotStatus()?.slot);

  /** The start bringing the slot's container up, while one is live. */
  protected readonly processId = computed(() => this.slotStatus()?.processId ?? null);

  protected readonly title = computed(() => `Agent ${this.id()}`);

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

  protected readonly state = computed((): LoadState => {
    if (this.work.state() === 'error') return 'error';
    if (this.work.state() === 'loaded' && !this.workId()) return 'loaded';
    const status = this.read()?.status;
    if (status === 'loaded') return 'loaded';
    return status === 'error' || status === 'missing' ? 'error' : 'loading';
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.workId();
      if (id) untracked(() => void this.store.loadItem(id));
    });
    this.store.follow(
      inject(DestroyRef),
      () => ({
        workId: this.workId(),
        agentId: this.agent()?.agentId,
        workspaceId: this.agent()?.workspaceRowId?.toString(),
      }),
      () => this.reload(),
    );
  }

  /** Reads the agent and its slot again (after a lifecycle event, a discard, a container verb). */
  protected reload(): void {
    const id = this.workId();
    if (id) void this.store.loadItem(id);
  }

  protected slotLink(rowId: number): string {
    return `/projects/${this.selected.slug() ?? ''}/workspaces/${rowId}`;
  }
}
