import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { refreshOn } from '$core/events/refresh-on';
import { runnerSlots } from '$core/system/runner-slots';
import { TARGET_EVENTS } from '$core/system/target-events';
import { TargetsStore } from '$core/system/targets.store';

/**
 * The lightning menu's heading. At the left, the general slots: `runners: N`; `slots: used/total`,
 * the targets' real slot count; and `shared: used/unreserved`, the types' use beyond their
 * reservations and the slots nothing reserves. At the right, only the reservations: each slot
 * type's use and its reservation (not a limit, so use may be larger), labels and values aligned,
 * with no caption; a tooltip on each row says "used / reserved".
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
          <span
            >slots: {{ line.used }}/{{ line.total }}
            <span class="text-[0.625rem] text-gray-400">used / total</span></span
          >
          <span
            >shared: {{ line.shared.used }}/{{ line.shared.unreserved }}
            <span class="text-[0.625rem] text-gray-400">used / unreserved</span></span
          >
        </div>
        <dl class="m-0 grid grid-cols-[auto_auto] gap-x-3">
          @for (row of line.types; track row.type) {
            <div class="contents" data-row>
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
  private readonly store = inject(TargetsStore);

  /** The line's figures once the targets are loaded; undefined while loading or on an error. */
  protected readonly summary = computed(() =>
    this.store.status() === 'loaded' ? runnerSlots(this.store.targets()) : undefined,
  );

  constructor() {
    refreshOn({ names: TARGET_EVENTS, refresh: () => void this.store.refresh() });
  }
}
