import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SelectedWork } from '$core/work/selected-work';
import { WORK_TABS } from '$core/work/work-tabs';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';

/**
 * A project's work section, at `/projects/<slug>/work/…`: a row of links to its pages
 * (Campaigns, then Refinement, Schedule, In Progress, Acceptance, Archive, in the order work moves
 * through them), each with its count once the work is loaded (open campaigns; epics and tickets;
 * on Schedule both its lists, REFINED and READY_FOR_DEV; in the Archive also its campaigns), and the page below. `/work` opens In Progress.
 *
 * The pages share the open project's work (`SelectedWork`, one request per project), so moving
 * between them fetches nothing. The layout keeps that work current while any of them is open.
 * It also loads the platform's open workspaces once (`WorkspacesStore`), for the cards' Workspace
 * links, and keeps them current the same way.
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
    return WORK_TABS.map((tab) => ({
      segment: tab.segment,
      label: tab.label,
      count: tab.count(graph),
    }));
  });

  constructor() {
    const destroy = inject(DestroyRef);
    this.work.followTransitions(destroy);
    // In the browser only, as the work: the server render has no session cookie to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const workspaces = inject(WorkspacesStore);
      void workspaces.load();
      workspaces.follow(destroy);
    }
  }
}
