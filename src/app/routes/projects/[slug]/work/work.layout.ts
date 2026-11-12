import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
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
 * A project's work section, at `/projects/<slug>/work/…`: its pages (Refinement, Schedule,
 * In Progress, Acceptance, Archive, in the order work moves through them), each with its count once
 * the work is loaded (epics and tickets; on Schedule both its lists, REFINED and READY_FOR_DEV), and
 * the page below. `/work` opens In Progress. Each page's link is a declared exit (`switch-work-tab`,
 * one per tab, epic qits-2000), marked current while its page is open (`[qitsExit]` sets
 * `aria-current`).
 *
 * From `md` up the links are a row of tabs (`<nav aria-label="Work">`), wrapping rather than
 * scrolling: a scrolling row would clip the gear's panel hanging below it. Below `md` they are a
 * bar instead (qits-2077): a burger ("Work views", a `ui-dropdown` whose panel is the list of the
 * same links, each closing it as it navigates) and the open page's name with its count. That name
 * comes from the route (the open child's path), not from a link marked active, so the server and
 * the browser draw the same bar.
 *
 * Either stays at the top of the box that scrolls the page, at `--app-pin-top` (the shell's: its top
 * bar's height where the document scrolls, 0 on `<main>` from 768px up), above the page's pinned
 * actions (`z-40`) and below the shell's top bar (`z-50`). What pins inside the page (its actions,
 * the board's headings, a drag's scroll margin) reads `--app-pin-top` too, so the outlet's box moves
 * it below the tabs: the host keeps the shell's value as `--work-pin-base`, and the box around the
 * outlet (and the page the outlet renders beside it) sets `--app-pin-top` to that plus the tabs'
 * height, measured in the browser (0 on the server).
 *
 * The pages share the open project's work (`SelectedWork`, one request per project), so moving
 * between them fetches nothing. The layout keeps that work current while any of them is open.
 * It also loads the platform's open workspaces once (`WorkspacesStore`), for the cards' Workspace
 * links, and keeps them current the same way. The VERIFIED tickets' lines read the project's
 * wrapper closings (`app-wrapper-closing`, qits-1873); the layout keeps those current too, once read
 * (`WrapperClosingsStore.follow`).
 *
 * While In Progress is the open page, a gear opens that page's view setting (qits-2051,
 * `InProgressViewStore`): a radio group, Epic boards or Inline, applied at once and kept in the
 * browser. It is a `ui-dropdown`, so it is named, and closes on Escape or a click outside. In the
 * row it sits after the tab's count, inside its list item, never inside the link (no control inside
 * a link); in the phone bar, after the page's name. Both are drawn from one template, each with a
 * radio group of its own; below `md` the panel is a sheet of its own.
 */
@Component({
  selector: 'app-work-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, NgTemplateOutlet, QitsExit, RouterOutlet],
  host: { class: 'block md:pt-4 [--work-pin-base:var(--app-pin-top,0px)]' },
  template: `
    <div #pinned class="sticky top-[var(--app-pin-top,0px)] z-45 bg-white" data-work-tabs>
      <!-- Below md: the burger and the open page's name. Not a nav named Work: that is the row's. -->
      <div class="flex items-center gap-1 border-b border-gray-200 px-4 py-1 md:hidden">
        <ui-dropdown #menu align="start" label="Work views" panelLabel="Work views">
          <svg
            dropdown-trigger
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <ul dropdown-panel class="m-0 list-none py-1 pl-0">
            @for (tab of tabs(); track tab.segment) {
              <li>
                <a
                  class="flex items-center justify-between gap-4 px-4 py-2 text-sm text-charcoal-brown-600 no-underline hover:bg-gray-50 hover:text-charcoal-brown-900 aria-[current=page]:bg-gray-100 aria-[current=page]:font-semibold aria-[current=page]:text-charcoal-brown-900"
                  [qitsExit]="tab.exit"
                  [exitParams]="{ slug: slug() }"
                  (click)="menu.close()"
                  >{{ tab.label }}
                  <span
                    class="rounded-full bg-gray-100 px-1.5 text-xs font-normal text-gray-700 tabular-nums"
                    [class.hidden]="work.state() !== 'loaded' || tab.count === undefined"
                    >{{ tab.count }}</span
                  ></a
                >
              </li>
            }
          </ul>
        </ui-dropdown>
        @if (currentTab(); as tab) {
          <p class="m-0 flex items-center gap-2 text-sm font-semibold text-charcoal-brown-900">
            {{ tab.label }}
            <span
              class="rounded-full bg-gray-100 px-1.5 text-xs font-normal text-gray-700 tabular-nums"
              [class.hidden]="work.state() !== 'loaded' || tab.count === undefined"
              >{{ tab.count }}</span
            >
          </p>
        }
        <!-- Hidden by class, as the row's: one markup on the server and in the browser. -->
        <div [class]="currentTab()?.viewSettings ? 'flex' : 'hidden'">
          <ng-container *ngTemplateOutlet="gear; context: { group: 'in-progress-view-bar' }" />
        </div>
      </div>
      <nav class="mx-auto max-w-[72rem] px-6 max-md:hidden md:pt-2" aria-label="Work">
        <ul class="m-0 flex list-none flex-wrap gap-1 border-b border-gray-200 p-0">
          @for (tab of tabs(); track tab.segment) {
            <li
              class="-mb-px flex shrink-0 items-center border-b-2 border-transparent has-[[aria-current=page]]:border-charcoal-brown-900"
            >
              <a
                #active="qitsExit"
                class="flex items-center gap-2 px-3 py-2 text-sm text-charcoal-brown-600 no-underline hover:text-charcoal-brown-900 aria-[current=page]:font-semibold aria-[current=page]:text-charcoal-brown-900"
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
                <div [class]="active.isActive() ? '-ml-1 flex pr-2' : 'hidden'">
                  <ng-container *ngTemplateOutlet="gear; context: { group: 'in-progress-view' }" />
                </div>
              }
            </li>
          }
        </ul>
      </nav>
    </div>
    <!-- The page renders beside the outlet, so this box holds both: what pins in it pins below the
         tabs. -->
    <div [style.--app-pin-top]="'calc(var(--work-pin-base) + ' + pinnedHeight() + 'px)'">
      <router-outlet />
    </div>

    <!-- The In Progress view's gear; \`group\` names its radio group, one per gear. -->
    <ng-template #gear let-group="group">
      <ui-dropdown align="start" label="In Progress view settings" panelLabel="In Progress view">
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
                  class="m-0"
                  [name]="group"
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
    </ng-template>
  `,
})
export class WorkLayout {
  protected readonly work = inject(SelectedWork);
  protected readonly views = inject(InProgressViewStore);

  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);

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

  /**
   * The open page's segment: the path of the layout's open child route, from the route and not
   * from a link marked active (which happens only after the first render), so the server and the
   * browser draw the same phone bar.
   */
  protected readonly current = toSignal(
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.openSegment()),
    ),
    { initialValue: this.openSegment() },
  );

  /** The open page's tab, for the phone bar; none while no tab's page is open. */
  protected readonly currentTab = computed(() =>
    this.tabs().find((tab) => tab.segment === this.current()),
  );

  private readonly pinned = viewChild.required<ElementRef<HTMLElement>>('pinned');

  /** The pinned tabs' height in px, kept current while it changes (0 on the server). */
  protected readonly pinnedHeight = signal(0);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      // Absent in jsdom (the plain specs); there the height stays 0.
      if (typeof ResizeObserver === 'undefined') return;
      const tabs = this.pinned().nativeElement;
      const observer = new ResizeObserver(() => this.pinnedHeight.set(tabs.offsetHeight));
      observer.observe(tabs);
      destroy.onDestroy(() => observer.disconnect());
    });
    this.work.followTransitions(destroy);
    inject(WrapperClosingsStore).follow(destroy, () => this.selected.project()?.id);
    // In the browser only, as the work: the server render holds no token to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const workspaces = inject(WorkspacesStore);
      void workspaces.load();
      workspaces.follow(destroy);
    }
  }

  private openSegment(): string | undefined {
    return this.route.firstChild?.routeConfig?.path;
  }
}
