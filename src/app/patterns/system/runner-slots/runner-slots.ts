import { ChangeDetectionStrategy, Component, computed, signal, untracked } from '@angular/core';
import { QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { runnerSlots } from '$core/system/runner-slots';
import { TARGET_EVENTS } from '$core/system/target-events';
import { targetOf } from '$core/system/targets';
import { TARGET_LIST } from '$core/system/targets.operations';

/**
 * The lightning menu's heading. At the left, the general slots: `runners: N`; `slots: used/total`,
 * the targets' real slot count; and `shared: used/unreserved`, the types' use beyond their
 * reservations and the slots nothing reserves. At the right, only the reservations: each slot
 * type's use and its reservation (not a limit, so use may be larger), labels and values aligned,
 * with no caption; a tooltip on each row says "used / reserved".
 * Only connected targets count (`runnerSlots`).
 *
 * The targets are read through the line's own `qitsResource` over `TARGET_LIST` (qits-2146), first
 * when the lightning menu opens (`load()`, which the menu calls on each opening: a failed read is
 * read again then). Shown only once the targets are loaded: hidden while they load, and when the
 * read fails, which it does for a person whose roles may not read qits-system's targets. The line
 * is the targets' list (`qitsEntityList`), its figures derived from it.
 *
 * Staleness (qits-1270): `TARGET_EVENTS` → the whole list (the resource's `refreshOn`), once it
 * was read.
 */
@Component({
  selector: 'app-runner-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsEntityList, QitsField],
  host: { class: 'block' },
  template: `
    @if (summary(); as line) {
      <div
        class="flex items-start justify-between gap-4 border-b border-line-subtle px-3 py-1.5 text-[0.6875rem] leading-4 text-fg-muted tabular-nums"
        data-testid="runner-slots"
        [qitsEntityList]="targets"
        [fieldOf]="answer()"
        [qitsField]="{ derived: [] }"
      >
        <div class="flex flex-col">
          <span>runners: {{ line.runners }}</span>
          <span
            >slots: {{ line.used }}/{{ line.total }}
            <span class="text-[0.625rem] text-fg-faint">used / total</span></span
          >
          <span
            >shared: {{ line.shared.used }}/{{ line.shared.unreserved }}
            <span class="text-[0.625rem] text-fg-faint">used / unreserved</span></span
          >
        </div>
        <dl class="m-0 grid grid-cols-[auto_auto] gap-x-3">
          @for (row of line.types; track row.type) {
            <div class="contents" data-row [fieldOf]="answer()" [qitsField]="aggregate">
              <!-- A display: contents box shows no tooltip, so each cell carries it. -->
              <dt title="used / reserved">{{ row.label }}:</dt>
              <dd class="m-0 text-right" title="used / reserved">
                {{ row.used }}/{{ row.reserved }}
              </dd>
            </div>
          }
        </dl>
      </div>
    }
  `,
})
export class RunnerSlots {
  /** The menu was opened once: the targets are read from then on. */
  private readonly opened = signal(false);

  /** qits-system's execution targets, once the menu opened. */
  protected readonly targets = qitsResource(TARGET_LIST, () => (this.opened() ? {} : undefined), {
    refreshOn: { names: TARGET_EVENTS, when: (): boolean => this.targets.hasValue() },
  });

  /** Each figure is summed over the connected targets, so it shows no one field as is. */
  protected readonly aggregate = { derived: [] } as const;

  /** The answer the figures are derived from: every target. */
  protected readonly answer = computed(() => this.targets.value() ?? []);

  /** The line's figures once the targets are loaded; undefined while loading or on an error. */
  protected readonly summary = computed(() =>
    this.targets.hasValue() && this.targets.status() !== 'error'
      ? runnerSlots(this.answer().map(targetOf))
      : undefined,
  );

  /** On each opening of the menu: reads the targets the first time, and again after a failure. */
  load(): void {
    untracked(() => {
      if (!this.opened()) this.opened.set(true);
      else if (this.targets.status() === 'error') this.targets.reload();
    });
  }
}
