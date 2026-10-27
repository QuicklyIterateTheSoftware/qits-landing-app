import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { refreshOn } from '$core/events/refresh-on';
import { runnerSlots } from '$core/system/runner-slots';
import { TARGET_EVENTS } from '$core/system/target-events';
import { TargetsStore } from '$core/system/targets.store';

/**
 * The lightning menu's heading. At the left: `runners: N` and `slots: used/total`. At the right, a
 * small grid with labels and values aligned, under a "used / reserved" caption: each slot type's
 * use and its reservation (a reservation, not a limit, so use may be larger). Below a rule,
 * `shared: used/capacity`: the slots nothing reserves, and the types' use beyond their reservations.
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
        <div class="flex flex-col">
          <span>runners: {{ line.runners }}</span>
          <span>slots: {{ line.used }}/{{ line.total }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-right text-[0.625rem] text-gray-400">used / reserved</span>
          <dl class="m-0 grid grid-cols-[auto_auto] gap-x-3">
            @for (row of line.types; track row.type) {
              <dt>{{ row.label }}:</dt>
              <dd class="m-0 text-right">{{ row.used }}/{{ row.reserved }}</dd>
            }
            <dt
              class="border-t border-gray-100"
              title="Slots used beyond the reservations / slots nothing reserves"
            >
              shared:
            </dt>
            <dd class="m-0 border-t border-gray-100 text-right">
              {{ line.shared.used }}/{{ line.shared.capacity }}
            </dd>
          </dl>
        </div>
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
