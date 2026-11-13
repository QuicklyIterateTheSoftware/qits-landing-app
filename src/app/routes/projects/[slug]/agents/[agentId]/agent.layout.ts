import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsResource,
  sourceMark,
  type ExitOutcome,
} from '@qits/angular';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { activityLabel, agentWaitLabel, runStateLabel } from '$core/workspaces/agent-labels';
import { AGENT_TABS } from '$core/workspaces/agent-tabs';
import type { AgentDetail } from '$core/workspaces/agents.consumes';
import {
  AGENT_DETAIL,
  AGENT_START,
  LIST_PROJECT_ACTIVE_AGENTS,
} from '$core/workspaces/agents.operations';
import { OPEN_AGENT, type OpenAgentRead } from '$core/workspaces/open-agent';
import { ProjectActiveAgents } from '$core/workspaces/project-active-agents';
import {
  concerns,
  WORKSPACE_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from '$core/workspaces/workspace-events';
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
 * header alone. Its links are declared exits (epic qits-2000): the item (`open-agent-item`), the
 * slot (`open-agent-workspace`) and one per tab (`switch-agent-tab`, marked current while its tab
 * is open: `[qitsExit]` sets `aria-current`).
 *
 * The agent comes from the layout's own `qitsResource` over `AGENT_DETAIL` (qits-2146; `getAgent`
 * by the URL's `:agentId`, in any state), and the start from one over `AGENT_START`
 * (`getAgentActiveProcess`), read again each time the agent is (its params follow the agent's
 * read), while the agent has a slot. The layout provides itself as `OPEN_AGENT`, so its tabs follow
 * the same read. Its open waits and attention come from the project's ACTIVE agents, which
 * `getAgent` does not carry: the shell's `ProjectActiveAgents`, the same request as the agents
 * menu's. In the browser only.
 *
 * What it shows carries the data marks (qits-2141): the header and the Workspace section are the
 * agent (`qitsEntity`, by `agentId`, from `AGENT_DETAIL`), each value its field or the fields its
 * words are derived from; the status line (`app-agent-status`, which marks the agent and its waits)
 * names `LIST_PROJECT_ACTIVE_AGENTS` as its source.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming the agent (`agentId`) or its slot
 * (`workspaceId`) → the agent, and with it its start (the resource's `refreshOn`, quietly, at most
 * once a second). `AGENT_STATUS_EVENTS` about the project → its waits and attention
 * (`ProjectActiveAgents`' `refreshOn`). Not announced: a queued agent's creation, the slot's
 * container stopping.
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
    QitsEntity,
    QitsExit,
    QitsField,
    RouterOutlet,
    Spinner,
    StartingLog,
  ],
  providers: [{ provide: OPEN_AGENT, useExisting: forwardRef(() => AgentLayout) }],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()">
        <ui-spinner [state]="spinnerState()" class="min-h-48">
          <p class="m-0 text-sm text-fg-soft" [class.hidden]="state() !== 'missing'">
            No agent {{ agentId() }}.
          </p>
          @if (agent(); as agent) {
            <div
              class="flex flex-col gap-6"
              [qitsEntity]="agent"
              entityKey="agentId"
              [entitySource]="read"
            >
              <section class="flex flex-col gap-2 text-sm" aria-label="Agent">
                @if (agent.entityId || agent.entityTitle) {
                  <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-base">
                    @if (slug() && agent.entityId; as id) {
                      <a
                        class="font-semibold text-accent no-underline hover:underline"
                        [qitsExit]="item.open"
                        [exitParams]="{ slug: slug(), id }"
                        [fieldOf]="agent"
                        qitsField="entityId"
                        >{{ agent.entityId }}</a
                      >
                    }
                    @if (agent.entityTitle; as title) {
                      <span class="text-fg" [fieldOf]="agent" qitsField="entityTitle">{{
                        title
                      }}</span>
                    }
                  </p>
                }
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-soft">
                  <ui-chip
                    [label]="(agent.state ?? 'unknown').toLowerCase()"
                    [tone]="stateTone()"
                    [fieldOf]="agent"
                    [qitsField]="{ derived: ['state'] }"
                  />
                  <span [fieldOf]="agent" [qitsField]="{ derived: ['runState'] }">{{
                    runState()
                  }}</span>
                  @if (doing(); as doing) {
                    <span aria-hidden="true">·</span>
                    <span
                      [class.font-semibold]="doing === 'waiting on you'"
                      [class.text-danger]="doing === 'waiting on you'"
                      [fieldOf]="agent"
                      [qitsField]="{ derived: ['activity', 'waitingOn', 'entityStatus'] }"
                      >{{ doing }}</span
                    >
                  }
                  @if (agent.entityStatus; as status) {
                    <span aria-hidden="true">·</span>
                    <span [fieldOf]="agent" [qitsField]="{ derived: ['entityStatus'] }"
                      >item {{ status.toLowerCase() }}</span
                    >
                  }
                  @if (agent.entityBlocked) {
                    <ui-chip
                      label="blocked"
                      tone="waiting"
                      [fieldOf]="agent"
                      [qitsField]="{ derived: ['entityBlocked'] }"
                    />
                  }
                  @if (agent.harness; as harness) {
                    <span aria-hidden="true">·</span>
                    <span [fieldOf]="agent" [qitsField]="{ derived: ['harness'] }">{{
                      harness.toLowerCase()
                    }}</span>
                  }
                  @if (agent.admin) {
                    <ui-chip
                      label="docker socket"
                      tone="waiting"
                      [fieldOf]="agent"
                      [qitsField]="{ derived: ['admin'] }"
                    />
                  }
                </div>
                @if (wait(); as wait) {
                  <p
                    class="m-0 text-warning"
                    role="status"
                    [fieldOf]="agent"
                    [qitsField]="{ derived: ['waitingOn', 'waitingOnSince'] }"
                  >
                    {{ wait }}
                  </p>
                }
                @if (status(); as status) {
                  <app-agent-status [agent]="status" [attr.data-qits-source]="statusSource" />
                }
                @if (agent.wrapperBranch; as branch) {
                  <p class="m-0 flex items-center gap-2 text-fg-soft">
                    <span class="font-semibold text-fg-soft">Branch</span>
                    <code class="font-mono text-xs" [fieldOf]="agent" qitsField="wrapperBranch">{{
                      branch
                    }}</code>
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
                <h2 id="agent-workspace" class="m-0 text-base font-semibold text-fg">Workspace</h2>
                @if (agent.workspaceRowId; as rowId) {
                  <p class="m-0 flex flex-wrap items-baseline gap-x-2 text-sm text-fg-soft">
                    <a
                      class="font-mono text-accent no-underline hover:underline"
                      [qitsExit]="workspace.open"
                      [exitParams]="{ slug: slug(), slotId: rowId }"
                      [fieldOf]="agent"
                      qitsField="workspaceRowId"
                      >ws-{{ rowId }}</a
                    >
                    <span
                      >its container, and the agents it hosts, are on the workspace’s page.</span
                    >
                  </p>
                } @else if (agent.state !== 'REMOVED') {
                  <p class="m-0 text-sm text-fg-soft">
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
            <ul class="m-0 flex list-none gap-1 overflow-x-auto border-b border-line p-0">
              @for (tab of tabs; track tab.segment) {
                <li class="shrink-0">
                  <a
                    class="-mb-px flex items-center border-b-2 border-transparent px-3 py-2 text-sm text-fg-soft no-underline hover:text-fg aria-[current=page]:border-fg aria-[current=page]:font-semibold aria-[current=page]:text-fg"
                    [qitsExit]="tab.exit"
                    [exitParams]="{ slug: slug(), agentId: agentId() }"
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
export class AgentLayout implements OpenAgentRead {
  private readonly selected = inject(SelectedProject);
  private readonly activeAgents = inject(ProjectActiveAgents);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The header's item, linked to its page (epic qits-2000). */
  protected readonly item = outcomes('open-agent-item', {
    open: exit('projects/:slug/work/detail/:id'),
  });

  /** The agent's slot, linked to its page (epic qits-2000). */
  protected readonly workspace = outcomes('open-agent-workspace', {
    open: exit('projects/:slug/workspaces/:slotId'),
  });

  private readonly switching = outcomes('switch-agent-tab', {
    chat: exit('projects/:slug/agents/:agentId/chat'),
    files: exit('projects/:slug/agents/:agentId/files'),
    terminal: exit('projects/:slug/agents/:agentId/terminal'),
  });

  /** Each tab's exit, by its segment (`AGENT_TABS`). */
  private readonly exits: Readonly<Record<string, ExitOutcome>> = {
    chat: this.switching.chat,
    files: this.switching.files,
    terminal: this.switching.terminal,
  };

  /** The tabs, each with its exit (one per tab, `switch-agent-tab`). */
  protected readonly tabs = AGENT_TABS.flatMap((tab) => {
    const exit = this.exits[tab.segment];
    return exit ? [{ ...tab, exit }] : [];
  });

  /** The open project's slug, the exits' param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The agent's id in the URL. */
  readonly agentId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('agentId') ?? '')),
    { initialValue: '' },
  );

  /**
   * The agent, by its id, in the browser only; again after the lifecycle events naming it or its
   * slot.
   */
  protected readonly read = qitsResource(
    AGENT_DETAIL,
    () => {
      const id = this.agentId();
      return this.browser && id ? { path: { id } } : undefined;
    },
    {
      refreshOn: {
        names: WORKSPACE_EVENTS,
        when: (event) =>
          concerns(event, {
            agentId: this.agentId() || undefined,
            workspaceId: this.agent()?.workspaceRowId?.toString(),
          }),
        debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
      },
    },
  );

  /** The agent, once read. */
  readonly agent = computed((): AgentDetail | undefined =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  /**
   * The start bringing the agent's slot's container up, asked of the agent while it has a slot.
   * Its params are made anew by every answer of the agent's read, so it is read again each time.
   */
  private readonly start = qitsResource(AGENT_START, () => {
    const agent = this.agent();
    const id = this.agentId();
    return id && agent?.workspaceRowId ? { path: { id } } : undefined;
  });

  /** The status line's source: the project's ACTIVE agents, as the shell reads them. */
  protected readonly statusSource = sourceMark(LIST_PROJECT_ACTIVE_AGENTS);

  /** The agent as the project's ACTIVE list holds it: its open waits and its attention. */
  protected readonly status = computed(() => {
    const agentId = this.agentId();
    return agentId ? this.activeAgents.agents().find((a) => a.agentId === agentId) : undefined;
  });

  /** The start bringing the agent's slot's container up, while one is live; none when not known. */
  protected readonly processId = computed(() =>
    this.start.hasValue() ? (this.start.value()?.technicalProcessId ?? null) : null,
  );

  protected readonly title = computed(() => {
    const item = this.agent()?.entityId;
    return item ? `Agent ${item}` : 'Agent';
  });

  protected readonly runState = computed(() => {
    const agent = this.agent();
    return agent ? runStateLabel(agent) : '';
  });

  protected readonly doing = computed(() => {
    const agent = this.agent();
    return agent ? activityLabel(agent.activity, agent.waitingOn, agent.entityStatus) : null;
  });

  protected readonly wait = computed(() => {
    const agent = this.agent();
    return agent ? agentWaitLabel(agent) : null;
  });

  protected readonly stateTone = computed((): ChipTone =>
    this.agent()?.state === 'ACTIVE' ? 'ok' : 'neutral',
  );

  /** The read's state: `missing` when the service does not know the agent (a 404). */
  protected readonly state = computed((): LoadState | 'missing' =>
    isMissing(this.read) ? 'missing' : loadState(this.read),
  );

  /** The spinner's state: a missing agent is a loaded page that says so. */
  protected readonly spinnerState = computed((): LoadState => {
    const state = this.state();
    return state === 'missing' ? 'loaded' : state;
  });

  /** Reads the agent, and with it its start, again (after a discard, a verb, a tab's ask). */
  reload(): void {
    if (this.agentId()) this.read.reload();
  }
}
