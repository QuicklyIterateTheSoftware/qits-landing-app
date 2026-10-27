import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { refreshOn } from '$core/events/refresh-on';
import { runnerSlots } from '$core/system/runner-slots';
import { TARGET_EVENTS } from '$core/system/target-events';
import { TargetsStore } from '$core/system/targets.store';

/**
 * The lightning menu's heading: `runners: N` at the far left, and at the far right a small grid
 * with `slots: used/total` and one row per slot type (`used/minimum`), labels and values aligned.
 * Only connected targets count (`runnerSlots`).
 *
 * Shown only once the targets are loaded: hidden while they load, and when the read fails, which
 * it does for a person whose roles may not read qits-system's targets.
 *
 * Staleness (qits-1270): `TARGET_EVENTS` → `TargetsStore.refresh()` (the whole list).
 */
@Component({
  selector: 'app-runner-slots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (summary(); as line) {
      <div
        class="flex items-start justify-between gap-4 border-b border-gray-100 px-3 py-1.5 text-[0.6875rem] leading-4 text-gray-500 tabular-nums"
        data-testid="runner-slots"
      >
        <span>runners: {{ line.runners }}</span>
        <dl class="m-0 grid grid-cols-[auto_auto] gap-x-3">
          <dt>slots:</dt>
          <dd class="m-0 text-right">{{ line.used }}/{{ line.total }}</dd>
          @for (row of line.types; track row.type) {
            <dt>{{ row.label }}:</dt>
            <dd class="m-0 text-right">{{ row.used }}/{{ row.reserved }}</dd>
          }
        </dl>
      </div>
    }
  `,
})
export class RunnerSlots {
  private readonly store = inject(TargetsStore);

  /** The line's figures once the targets are loaded; undefined while loading or on an error. */
  protected readonly summary = computed(() =>
    this.store.status() === 'loaded' ? runnerSlots(this.store.targets()) : undefined,
  );

  constructor() {
    refreshOn({ names: TARGET_EVENTS, refresh: () => void this.store.refresh() });
  }
}
