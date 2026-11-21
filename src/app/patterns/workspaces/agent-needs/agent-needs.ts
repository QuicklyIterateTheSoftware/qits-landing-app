import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedWork } from '$core/work/selected-work';
import { WORK_MARKS } from '$core/work/work-marks';
import { agentNeedsWait, needsWaitLabel } from '$core/workspaces/agent-labels';
import { WorkRef } from '$patterns/work/work-ref/work-ref';

/** The agent fields the line reads. */
export interface NeedsAgent {
  readonly entityId?: string | null;
  readonly entityStatus?: string | null;
  readonly activity?: string | null;
  readonly waitingOn?: string | null;
}

/**
 * What an agent waits on from its item's needs (qits-2494): `waits on <item> (<its status>), …`,
 * one link per need not met yet (`app-work-ref`, to the item's page). Shown only when nothing
 * declared wins over it ({@link agentNeedsWait}): the desk moves the item on by itself once the
 * needs are met, so this is not "waiting on you". The warning tone, as a declared wait's line.
 *
 * The needs come from `SelectedWork` (`PROJECT_WORK`): one read of the project's work, however many
 * rows show it. It asks for that read (`want()`); the page keeps it current (`followTransitions`).
 * The marks are plain attributes, as `work-marks.ts` says: the item the needs are of, and each
 * status derived from its `needs`.
 */
@Component({
  selector: 'app-agent-needs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WorkRef],
  host: { class: 'contents' },
  template: `
    @if (needs().length) {
      <p
        class="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-warning"
        role="status"
        data-agent-needs
        [attr.aria-label]="label()"
        [attr.data-qits-source]="marks.source"
        [attr.data-qits-item]="itemMark()"
      >
        <span>waits on</span>
        @for (need of needs(); track need.qualifiedId; let last = $last) {
          <app-work-ref [qualifiedId]="need.qualifiedId ?? ''" />
          <span data-qits-derived="needs"
            >{{ need.currentStatus ? '(' + need.currentStatus + ')' : ''
            }}{{ last ? '' : ',' }}</span
          >
        }
      </p>
    }
  `,
})
export class AgentNeeds {
  readonly agent = input.required<NeedsAgent>();

  private readonly work = inject(SelectedWork);

  constructor() {
    this.work.want();
  }

  /** The agent's item, as the project's work holds it. */
  private readonly entry = computed(() => this.work.entryOf(this.agent().entityId));

  protected readonly needs = computed(() => agentNeedsWait(this.agent(), this.entry()?.needs));
  protected readonly label = computed(() => needsWaitLabel(this.needs()));

  protected readonly marks = WORK_MARKS;
  protected readonly itemMark = computed(() => {
    const entry = this.entry();
    return entry ? WORK_MARKS.item(entry) : null;
  });
}
