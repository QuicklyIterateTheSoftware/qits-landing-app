import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SelectedWork } from '$core/work/selected-work';
import { WORK_TABS } from '$core/work/work-tabs';

/**
 * A project's work section, at `/projects/<slug>/work/…`: a row of links to its pages
 * (Refinement, In Progress, Acceptance, Archive, in the order work moves through them), each with
 * the number of epics and tickets on it once the work is loaded, and the page below. `/work` opens
 * In Progress.
 *
 * The pages share the open project's work (`SelectedWork`, one request per project), so moving
 * between them fetches nothing. The layout keeps that work current while any of them is open.
 */
@Component({
  selector: 'app-work-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  host: { class: 'block' },
  template: `
    <nav class="mx-auto max-w-[72rem] px-6 pt-6" aria-label="Work">
      <ul class="m-0 flex list-none gap-1 overflow-x-auto border-b border-gray-200 p-0">
        @for (tab of tabs(); track tab.segment) {
          <li class="shrink-0">
            <a
              class="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900 aria-[current=page]:border-charcoal-brown-900 aria-[current=page]:font-semibold aria-[current=page]:text-charcoal-brown-900"
              [routerLink]="tab.segment"
              routerLinkActive=""
              ariaCurrentWhenActive="page"
              >{{ tab.label }}
              <span
                class="rounded-full bg-gray-100 px-1.5 text-xs font-normal text-gray-700 tabular-nums"
                [class.hidden]="work.state() !== 'loaded'"
                >{{ tab.count }}</span
              ></a
            >
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class WorkLayout {
  protected readonly work = inject(SelectedWork);

  /** The tabs, each with its count (0 until the work is loaded, and hidden until then). */
  protected readonly tabs = computed(() => {
    const graph = this.work.graph();
    return WORK_TABS.map((tab) => ({ ...tab, count: graph.count(tab.phase) }));
  });

  constructor() {
    this.work.followTransitions(inject(DestroyRef));
  }
}
