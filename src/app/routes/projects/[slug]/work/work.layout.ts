import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { exit, outcomes, QitsExit, type ExitOutcome } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { InProgressViewStore, type InProgressView } from '$core/work/in-progress-view';
import { SelectedWork } from '$core/work/selected-work';
import { WrapperClosingsStore } from '$core/work/wrapper-closings.store';
import { WORK_TABS } from '$core/work/work-tabs';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import { Dropdown } from '$ui/components/dropdown/dropdown';

/** A gear's outline on a 24×24 grid, as `ui-automation-cog` draws its cog. */
const COG =
  'M10.3 2.5h3.4l.5 2.4 1.7.7 2-1.4 2.4 2.4-1.4 2 .7 1.7 2.4.5v3.4l-2.4.5-.7 1.7 1.4 2-2.4 2.4-2-1.4-1.7.7-.5 2.4h-3.4l-.5-2.4-1.7-.7-2 1.4-2.4-2.4 1.4-2-.7-1.7-2.4-.5v-3.4l2.4-.5.7-1.7-1.4-2 2.4-2.4 2 1.4 1.7-.7z';

/** The In Progress tab's views, as its settings panel offers them. */
const VIEW_CHOICES: readonly { readonly view: InProgressView; readonly label: string }[] = [
  { view: 'epics', label: 'Epic boards' },
  { view: 'inline', label: 'Inline' },
];

/**
 * A project's work section, at `/projects/<slug>/work/…`: a row of links to its pages
 * (Refinement, Schedule, In Progress, Acceptance, Archive, in the order work moves through them),
 * each with its count once the work is loaded (epics and tickets; on Schedule both its lists,
 * REFINED and READY_FOR_DEV), and the page below. `/work` opens In Progress. Each tab is a declared
 * exit (`switch-work-tab`, one per tab, epic qits-2000), marked current while its page is open
 * (`[qitsExit]` sets `aria-current`).
 *
 * The pages share the open project's work (`SelectedWork`, one request per project), so moving
 * between them fetches nothing. The layout keeps that work current while any of them is open.
 * It also loads the platform's open workspaces once (`WorkspacesStore`), for the cards' Workspace
 * links, and keeps them current the same way. The VERIFIED tickets' lines read the project's
 * wrapper closings (`app-wrapper-closing`, qits-1873); the layout keeps those current too, once read
 * (`WrapperClosingsStore.follow`).
 *
 * While In Progress is the open tab, a gear after its count opens that page's view setting
 * (qits-2051, `InProgressViewStore`): a radio group, Epic boards or Inline, applied at once and kept
 * in the browser. The gear sits beside the tab's link, inside its list item, never inside the link
 * (no control inside a link); it is a `ui-dropdown`, so it is named, and closes on Escape or a click
 * outside. From `md` up the tabs wrap rather than scroll: a scrolling row would clip the panel
 * hanging below it. Below `md` the panel is a sheet of its own, so the row scrolls there as before.
 */
@Component({
  selector: 'app-work-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, QitsExit, RouterOutlet],
  host: { class: 'block' },
  template: `
    <nav class="mx-auto max-w-[72rem] px-6 pt-6" aria-label="Work">
      <ul
        class="m-0 flex list-none gap-1 overflow-x-auto border-b border-gray-200 p-0 md:flex-wrap md:overflow-visible"
      >
        @for (tab of tabs(); track tab.segment) {
          <li class="flex shrink-0 items-center">
            <a
              #active="qitsExit"
              class="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900 aria-[current=page]:border-charcoal-brown-900 aria-[current=page]:font-semibold aria-[current=page]:text-charcoal-brown-900"
              [qitsExit]="tab.exit"
              [exitParams]="{ slug: slug() }"
              >{{ tab.label }}
              <span
                class="rounded-full bg-gray-100 px-1.5 text-xs font-normal text-gray-700 tabular-nums"
                [class.hidden]="work.state() !== 'loaded' || tab.count === undefined"
                >{{ tab.count }}</span
              ></a
            >
            @if (tab.viewSettings) {
              <!-- Hidden by class, never by @if: the link is marked active only after the first
                   render, and a block the server drew that the browser drops at hydration stays
                   until hydration's clean-up. -->
              <div [class]="active.isActive() ? '-ml-1 flex' : 'hidden'">
                <ui-dropdown
                  align="start"
                  label="In Progress view settings"
                  panelLabel="In Progress view"
                >
                  <svg
                    dropdown-trigger
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    class="size-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  >
                    <path [attr.d]="cog" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div dropdown-panel class="px-3 py-2">
                    <fieldset class="m-0 flex flex-col gap-1 border-0 p-0 text-sm">
                      <legend class="mb-1 p-0 text-xs font-semibold text-charcoal-brown-600">
                        In Progress view
                      </legend>
                      @for (choice of choices; track choice.view) {
                        <label
                          class="flex cursor-pointer items-center gap-2 py-1 whitespace-nowrap text-charcoal-brown-900"
                        >
                          <input
                            type="radio"
                            name="in-progress-view"
                            class="m-0"
                            [value]="choice.view"
                            [checked]="views.view() === choice.view"
                            (change)="views.set(choice.view)"
                          />
                          {{ choice.label }}
                        </label>
                      }
                    </fieldset>
                  </div>
                </ui-dropdown>
              </div>
            }
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class WorkLayout {
  protected readonly work = inject(SelectedWork);
  protected readonly views = inject(InProgressViewStore);

  private readonly selected = inject(SelectedProject);

  protected readonly choices = VIEW_CHOICES;
  protected readonly cog = COG;

  private readonly switching = outcomes('switch-work-tab', {
    refinement: exit('projects/:slug/work/refinement'),
    schedule: exit('projects/:slug/work/schedule'),
    inProgress: exit('projects/:slug/work/in-progress'),
    acceptance: exit('projects/:slug/work/acceptance'),
    archive: exit('projects/:slug/work/archive'),
  });

  /** Each tab's exit, by its segment (`WORK_TABS`). */
  private readonly exits: Readonly<Record<string, ExitOutcome>> = {
    refinement: this.switching.refinement,
    schedule: this.switching.schedule,
    'in-progress': this.switching.inProgress,
    acceptance: this.switching.acceptance,
    archive: this.switching.archive,
  };

  /** The open project's slug, the tabs' exits' param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /**
   * The tabs, each with its exit and its count (0 until the work is loaded, and hidden until then);
   * In Progress with its view settings (`viewSettings`).
   */
  protected readonly tabs = computed(() => {
    const graph = this.work.graph();
    return WORK_TABS.flatMap((tab) => {
      const exit = this.exits[tab.segment];
      return exit
        ? [
            {
              segment: tab.segment,
              label: tab.label,
              exit,
              count: tab.count?.(graph),
              viewSettings: tab.segment === 'in-progress',
            },
          ]
        : [];
    });
  });

  constructor() {
    const destroy = inject(DestroyRef);
    this.work.followTransitions(destroy);
    inject(WrapperClosingsStore).follow(destroy, () => this.selected.project()?.id);
    // In the browser only, as the work: the server render holds no token to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const workspaces = inject(WorkspacesStore);
      void workspaces.load();
      workspaces.follow(destroy);
    }
  }
}
