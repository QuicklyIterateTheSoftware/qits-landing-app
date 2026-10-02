import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WorkEntry } from '../../../core/work/work.consumes';

/**
 * A plain list of work entities: qualified id, title, archetype, and (with `showStatus`) the
 * status. The Backlog and the Archive both use it.
 *
 * The empty note is always rendered and hidden by class, never added by `@if`, so a page the
 * server rendered empty hydrates without leftovers.
 */
@Component({
  selector: 'app-work-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul
      class="m-0 list-none divide-y divide-charcoal-brown-100 rounded-lg border border-charcoal-brown-100 p-0"
      [class.hidden]="!entries().length"
    >
      @for (entry of entries(); track entry.id) {
        <li class="flex items-baseline gap-3 px-3 py-2 text-sm">
          <span class="shrink-0 font-mono text-xs text-charcoal-brown-600">{{
            entry.qualifiedId
          }}</span>
          <span class="min-w-0 flex-1 truncate text-charcoal-brown-900">{{ entry.title }}</span>
          @if (showStatus()) {
            <span
              class="shrink-0 rounded-sm bg-charcoal-brown-100 px-1.5 text-[0.6875rem] text-charcoal-brown-700"
              >{{ entry.status?.toLowerCase() }}</span
            >
          }
          <span
            class="shrink-0 rounded-sm bg-ocean-deep-50 px-1.5 text-[0.6875rem] text-ocean-deep-800"
            >{{ entry.archetype?.toLowerCase() }}</span
          >
        </li>
      }
    </ul>
    <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="entries().length">
      Nothing here
    </p>
  `,
})
export class WorkList {
  readonly entries = input.required<readonly WorkEntry[]>();

  /** Also show each entry's status (the Archive mixes Done and Dropped). */
  readonly showStatus = input(false, { transform: booleanAttribute });
}
