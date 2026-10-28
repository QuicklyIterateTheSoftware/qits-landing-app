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
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { SelectedProject } from '$core/projects/selected-project';
import { AgentsStore } from '$core/workspaces/agents.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { AgentRow } from '$patterns/workspaces/agent-row/agent-row';
import { ContainerActions } from '$patterns/workspaces/container-actions/container-actions';
import { SlotStatus } from '$patterns/workspaces/slot-status/slot-status';
import { StartingLog } from '$patterns/workspaces/starting-log/starting-log';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * One workspace slot, at `/projects/<slug>/workspaces/<slot id>` (epic qits-1230), ported from
 * qits-workspaces-frontend's workspace page. A slot hosts agents and runs one working agent at a
 * time. Its status strip (container, runner, daemon, how many agents) with the container's verbs
 * (`app-container-actions`: start or stop, recreate; read again after each), the log of the start
 * bringing its container up while one runs, and the agents it hosts — each a link to the
 * agent's page (`agents/<agent id>`, epic qits-1681).
 *
 * Read by `AgentsStore.loadSlot`, again after a lifecycle event about this slot (at most once a
 * second). A slot that resolved answers 404: "This workspace is gone". In the browser only.
 *
 * Staleness (qits-1270): `WORKSPACE_EVENTS` naming this slot (`workspaceId`, its row id) → the
 * slot, its live start and the agents it hosts (`AgentsStore.loadSlot`, quietly). Not announced
 * (see `AgentsStore`): the container stopping or a start beginning (and with it the start's log,
 * which shows on a container verb of this page's or the next lifecycle event), the runner going
 * offline, the hosted agents' activity.
 */
@Component({
  selector: 'app-workspace-slot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgentRow, ContainerActions, PageLayoutComponent, SlotStatus, Spinner, StartingLog],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()">
        <ui-spinner [state]="state()" class="min-h-48">
          @if (missing()) {
            <p class="m-0 text-sm text-charcoal-brown-600">
              This workspace is gone: it resolved once its last agent was removed, or it never
              existed.
            </p>
          }
          @if (slot(); as slot) {
            <div class="flex flex-col gap-8">
              <p class="m-0 max-w-[48rem] text-sm text-charcoal-brown-600">
                A workspace is a slot that hosts agents. It runs one working agent at a time; an
                agent that waits for a person keeps its harness and terminal, but yields the slot to
                the next one.
              </p>
              <app-slot-status
                [slot]="slot"
                [hosted]="agentsLoaded() ? agents().length : undefined"
              />
              <app-container-actions [slot]="slot" (changed)="reload()" />
              @if (processId(); as processId) {
                <app-starting-log [processId]="processId" />
              }
              <section class="flex flex-col gap-3" aria-labelledby="slot-agents">
                <h2 id="slot-agents" class="m-0 text-base font-semibold text-charcoal-brown-900">
                  Agents
                </h2>
                <ui-spinner [state]="agentsState()" class="min-h-12">
                  <p
                    class="m-0 text-sm text-charcoal-brown-500"
                    [class.hidden]="agentsState() !== 'loaded' || agents().length"
                  >
                    No agent is in this workspace. The platform removes an empty workspace.
                  </p>
                  <ul class="m-0 flex list-none flex-col gap-2 p-0">
                    @for (agent of agents(); track agent.agentId) {
                      <li><app-agent-row [agent]="agent" [slug]="slug()" /></li>
                    }
                  </ul>
                </ui-spinner>
              </section>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkspaceSlotPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(AgentsStore);

  protected readonly slug = computed(() => this.selected.slug());

  /** The slot's row id in the URL. */
  protected readonly slotId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => Number(params.get('slotId') ?? ''))),
    { initialValue: Number.NaN },
  );

  private readonly status = computed(() => this.store.slotOf(this.slotId()));
  private readonly hostedRead = computed(() => this.store.slotAgentsOf(this.slotId()));

  protected readonly slot = computed(() => this.status()?.slot);
  protected readonly processId = computed(() => this.status()?.processId ?? null);
  protected readonly missing = computed(() => this.status()?.status === 'missing');
  protected readonly agents = computed(() => this.hostedRead()?.agents ?? []);
  protected readonly agentsLoaded = computed(() => this.hostedRead()?.status === 'loaded');

  protected readonly title = computed(
    () => `Workspace ${this.slot()?.workspaceId ?? `ws-${this.slotId() || ''}`}`,
  );

  protected readonly state = computed((): LoadState => {
    const status = this.status()?.status;
    if (status === 'loaded' || status === 'missing') return 'loaded';
    return status === 'error' || !Number.isInteger(this.slotId()) ? 'error' : 'loading';
  });

  protected readonly agentsState = computed((): LoadState => {
    const status = this.hostedRead()?.status;
    return status === 'loaded' ? 'loaded' : status === 'loading' || !status ? 'loading' : 'error';
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.slotId();
      if (Number.isInteger(id)) untracked(() => void this.store.loadSlot(id));
    });
    this.store.follow(
      inject(DestroyRef),
      () => ({ workspaceId: String(this.slotId()) }),
      () => this.reload(),
    );
  }

  /** Reads the slot and its agents again (after a lifecycle event, a container verb). */
  protected reload(): void {
    void this.store.loadSlot(this.slotId());
  }
}
