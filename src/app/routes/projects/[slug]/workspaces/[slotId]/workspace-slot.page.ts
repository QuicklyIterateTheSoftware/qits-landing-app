import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  QitsEntity,
  QitsEntityList,
  qitsResource,
  sourceMark,
  type QitsRefreshOn,
} from '@qits/angular';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { isMissing } from '$core/resources/resource-family';
import { notRemoved } from '$core/workspaces/agent-lists';
import { SLOT_AGENTS, SLOT_DETAIL, SLOT_START } from '$core/workspaces/agents.operations';
import { valueMarks } from '$core/marks/value-marks';
import {
  concerns,
  WORKSPACE_EVENTS,
  WORKSPACE_REFRESH_DEBOUNCE_MS,
} from '$core/workspaces/workspace-events';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentRow } from '$patterns/workspaces/agent-row/agent-row';
import { ContainerActions } from '$patterns/workspaces/container-actions/container-actions';
import { HarnessSetup } from '$patterns/workspaces/harness-setup/harness-setup';
import { SlotStatus } from '$patterns/workspaces/slot-status/slot-status';
import { StartingLog } from '$patterns/workspaces/starting-log/starting-log';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * One workspace slot, at `/projects/<slug>/workspaces/<slot id>` (epic qits-1230), ported from
 * qits-workspaces-frontend's workspace page. A slot hosts agents and runs one working agent at a
 * time. Its status strip (container, runner, daemon, how many agents) with the container's verbs
 * (`app-container-actions`: start or stop, recreate; read again after each; a stop or recreate is
 * confirmed naming the agents it affects, and then names the agents the service says it affected:
 * epic qits-1667, the only page with container verbs), the log of the start bringing its container
 * up while one runs, the agents it hosts (`listWorkspaceAgents`) — each a link to the agent's
 * page (`agents/<agent id>`, epic qits-1681) — and the container's harness install
 * (`app-harness-setup`: the harness sign-in and the plugins, moved here from the agent's Terminal
 * tab in epic qits-1667, since they are the container's, not one agent's).
 *
 * Read through the page's own `qitsResource`s (qits-2146): the slot (`SLOT_DETAIL`), the start
 * running against it (`SLOT_START`) and the agents it hosts (`SLOT_AGENTS`), again after a
 * lifecycle event about this slot (at most once a second) and after a container verb. A slot that
 * resolved answers 404: "This workspace is gone". In the browser only.
 *
 * What it shows carries the data marks (qits-2141): the slot's content is the slot (`qitsEntity`,
 * by `id`, from `SLOT_DETAIL`; `app-slot-status` marks its fields), the agents' list names
 * `SLOT_AGENTS` (each `app-agent-row` marks its agent), and the container's verbs are handed that
 * read.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming this slot (`workspaceId`, its row id) → the
 * slot, its live start and the agents it hosts (each resource's `refreshOn`, quietly). Not
 * announced: the container stopping or a start beginning (and with it the start's log, which shows
 * on a container verb of this page's or the next lifecycle event), the runner going offline, the
 * hosted agents' activity.
 */
@Component({
  selector: 'app-workspace-slot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AgentRow,
    ContainerActions,
    HarnessSetup,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    SlotStatus,
    Spinner,
    StartingLog,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()">
        <ui-spinner [state]="state()" class="min-h-48">
          @if (missing()) {
            <p class="m-0 text-sm text-fg-soft">
              This workspace is gone: it resolved once its last agent was removed, or it never
              existed.
            </p>
          }
          @if (slot(); as slot) {
            <div
              class="flex flex-col gap-8"
              [qitsEntity]="slot"
              entityKey="id"
              [entitySource]="slotRead"
            >
              <p class="m-0 max-w-[48rem] text-sm text-fg-soft">
                A workspace is a slot that hosts agents. It runs one working agent at a time; an
                agent that waits for a person keeps its harness and terminal, but yields the slot to
                the next one.
              </p>
              <app-slot-status
                [slot]="slot"
                [hosted]="agentsLoaded() ? agents().length : undefined"
                [hostedMarks]="hostedMarks"
              />
              <app-container-actions [slot]="slot" [hosted]="hosted" (changed)="reload()" />
              @if (processId(); as processId) {
                <app-starting-log [processId]="processId" />
              }
              <section class="flex flex-col gap-3" aria-labelledby="slot-agents">
                <h2 id="slot-agents" class="m-0 text-base font-semibold text-fg">Agents</h2>
                <ui-spinner [state]="agentsState()" class="min-h-12">
                  <p
                    class="m-0 text-sm text-fg-muted"
                    [class.hidden]="agentsState() !== 'loaded' || agents().length"
                  >
                    No agent is in this workspace. The platform removes an empty workspace.
                  </p>
                  <ul class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="hosted">
                    @for (agent of agents(); track agent.agentId) {
                      <li><app-agent-row [agent]="agent" [slug]="slug()" /></li>
                    }
                  </ul>
                </ui-spinner>
              </section>
              @if (slot.id; as id) {
                <app-harness-setup [workspaceRowId]="id" [harness]="harness()" />
              }
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkspaceSlotPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly slug = computed(() => this.selected.slug());

  /** The slot's row id in the URL. */
  protected readonly slotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('slotId') ?? ''))),
    { initialValue: Number.NaN },
  );

  /** The slot's path, in the browser only, for a valid row id. */
  private readonly params = () => {
    const id = this.slotId();
    return this.browser && Number.isInteger(id) && id > 0 ? { path: { id } } : undefined;
  };

  /** Each read again after the lifecycle events naming this slot. */
  private readonly refreshOn: QitsRefreshOn = {
    names: WORKSPACE_EVENTS,
    when: (event) => concerns(event, { workspaceId: String(this.slotId()) }),
    debounceMs: WORKSPACE_REFRESH_DEBOUNCE_MS,
  };

  /** The slot. */
  protected readonly slotRead = qitsResource(SLOT_DETAIL, this.params, {
    refreshOn: this.refreshOn,
  });

  /** The start bringing its container up, if one is live; a failed lookup shows none. */
  private readonly start = qitsResource(SLOT_START, this.params, { refreshOn: this.refreshOn });

  /** The agents it hosts. */
  protected readonly hosted = qitsResource(SLOT_AGENTS, this.params, {
    refreshOn: this.refreshOn,
  });

  protected readonly slot = computed(() =>
    this.slotRead.hasValue() ? this.slotRead.value()?.workspace : undefined,
  );
  protected readonly processId = computed(() =>
    this.start.hasValue() ? (this.start.value()?.technicalProcessId ?? null) : null,
  );
  protected readonly missing = computed(() => isMissing(this.slotRead));
  protected readonly agents = computed(() =>
    notRemoved(this.hosted.hasValue() ? this.hosted.value()?.agents : undefined),
  );
  protected readonly agentsLoaded = computed(() => this.hosted.hasValue());
  /** The status strip's agent count (qits-2146): counted from the hosted agents' read. */
  protected readonly hostedMarks = {
    source: sourceMark(SLOT_AGENTS),
    item: null,
    derived: 'agents',
  } as const;
  /** The harness the slot's agents run, for the sign-in notice; any when none is listed. */
  protected readonly harness = computed(
    () => this.agents().find((agent) => agent.harness)?.harness ?? null,
  );

  protected readonly title = computed(
    () => `Workspace ${this.slot()?.workspaceId ?? `ws-${this.slotId() || ''}`}`,
  );
  /** The title's data marks (qits-2146): the slot's workspace id, once the slot is read. */
  protected readonly titleMarks = computed(() => {
    const slot = this.slot();
    return slot?.workspaceId != null
      ? valueMarks(SLOT_DETAIL, slot, 'id', { derived: ['workspaceId'] })
      : undefined;
  });

  protected readonly state = computed((): LoadState => {
    if (isMissing(this.slotRead)) return 'loaded';
    return !Number.isInteger(this.slotId()) ? 'error' : loadState(this.slotRead);
  });

  protected readonly agentsState = computed((): LoadState => loadState(this.hosted));

  /** Reads the slot, its start and its agents again (after a container verb). */
  protected reload(): void {
    if (!this.params()) return;
    this.slotRead.reload();
    this.start.reload();
    this.hosted.reload();
  }
}
