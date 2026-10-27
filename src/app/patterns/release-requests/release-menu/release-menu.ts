import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { activeRunsOf } from '$core/ci/active-runs';
import { CiRunsStore } from '$core/ci/ci-runs.store';
import { refreshOn } from '$core/events/refresh-on';
import {
  affectsReleaseRequests,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { releaseRequestRef, requestTone } from '$core/projects/release-requests';
import { attentionOf, lifecycleSummary } from '$core/release-requests/release-lifecycle';
import { LifecycleLine } from '$ui/components/lifecycle-line/lifecycle-line';
import { chipClass, type ChipTone } from '$ui/components/chip/chip';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { TargetsStore } from '$core/system/targets.store';
import { RunnerSlots } from '$patterns/system/runner-slots/runner-slots';
import { ActiveRuns } from '$patterns/release-requests/active-runs/active-runs';

/** How long a burst of domain events waits before the requests are fetched again. */
export { REFRESH_DEBOUNCE_MS } from '$core/events/refresh-on';

/**
 * The top bar's lightning menu: the open project's pending release requests, each named by its
 * logical id (`<repository>-rr-<n>`) and shown with its state
 * and its lifecycle as a line (`lifecycleSummary`): a cog for the automations, phase chips, a
 * shield for each group of gates. Shown only while a project is open, like the settings gear.
 *
 * A request that needs a person (`attentionOf`: an approval to give, a conflict, a failed gate or
 * automation) is listed first, with an amber border, and its shield or cog stands out; its link
 * opens the request's page at that check, whose name is in the link's tooltip. The button's badge counts those requests, in red; with none, it counts the
 * pending requests, in amber.
 *
 * The requests are fetched as soon as a project opens (`loadReleaseRequests`), so the button
 * carries their count right away (none when nothing is pending). They are fetched again when a
 * domain event says they may have changed ({@link RELEASE_REQUEST_EVENTS}, filtered to the open
 * project by `affectsReleaseRequests`), at most once a second, since one release sends several.
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` about the open project → its pending requests
 * (`ProjectsStore.refreshReleaseRequests`; the list answer is the only read, so a row change reads
 * it too).
 * The panel starts with the runners and slots line (`RunnerSlots`), fetched on each opening until
 * it loads.
 * Below a request with a queued or running CI run (`activeRunsOf`: its QA, release and gate runs,
 * its automations), a chip per kind links to the run in qits-ci (`ActiveRuns`). The active runs
 * are read on each opening until they load (`CiRunsStore.loadActive`), and again after a build
 * event of a pending request's repository (`followActive`). A refused read shows no chip.
 * The button and the panel are `ui-dropdown`'s. Each request links to its page
 * (`/projects/<slug>/release-requests/<requestId>`); following the link closes the panel.
 */
@Component({
  selector: 'app-release-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActiveRuns, Dropdown, LifecycleLine, RouterLink, RunnerSlots, Spinner],
  // One display class or the other: a static display class would beat `hidden`. `ml-auto` pushes
  // the menu and the settings gear after it to the right end of the top bar.
  host: {
    '[class]': "projectId() ? 'inline-flex' : 'hidden'",
  },
  template: `
    <ui-dropdown
      #menu
      label="Release requests"
      panelLabel="Pending release requests"
      panelId="release-menu"
      (opened)="load()"
    >
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
      <span
        dropdown-trigger
        class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
        [class]="
          (attentionCount()
            ? 'bg-cinnabar-600 text-white'
            : 'bg-sunflower-gold-500 text-charcoal-brown-950') + (count() ? '' : ' hidden')
        "
        aria-hidden="true"
        >{{ attentionCount() || count() }}</span
      >
      <app-runner-slots dropdown-panel />
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 list-none p-0">
          @for (row of rows(); track row.request.id) {
            @let request = row.request;
            <li
              class="border-b border-gray-100 last:border-b-0"
              [class]="
                row.attention.length
                  ? 'border-l-4 border-l-sunflower-gold-500 bg-sunflower-gold-50'
                  : ''
              "
            >
              <a
                class="flex flex-col gap-1 px-3 py-2 no-underline hover:bg-gray-50"
                [routerLink]="['/projects', slug(), 'release-requests', ref(request)]"
                [fragment]="row.attention[0]?.anchor"
                [attr.title]="
                  row.attention[0] ? row.attention[0].action + ': ' + row.attention[0].label : null
                "
                (click)="menu.close()"
              >
                <div class="flex items-baseline justify-between gap-2">
                  <span class="truncate text-sm font-semibold text-gray-900">{{
                    request.qualifiedId ?? request.repoName
                  }}</span>
                  <span
                    class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                    [class]="chip(requestTone(request.state))"
                    >{{ request.state }}</span
                  >
                </div>
                <span class="truncate text-[0.8125rem] text-gray-600">{{ request.summary }}</span>
                <ui-lifecycle-line [points]="row.summary" [spread]="true" />
              </a>
              <app-active-runs class="-mt-1 px-3 pb-2" [runs]="row.active" />
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || pending().length > 0"
        >
          No pending release requests
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class ReleaseMenu {
  private readonly store = inject(ProjectsStore);
  private readonly selected = inject(SelectedProject);
  private readonly targets = inject(TargetsStore);
  private readonly ci = inject(CiRunsStore);
  protected readonly requestTone = requestTone;
  protected readonly ref = releaseRequestRef;

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  /** The open project's slug, which the request links name. */
  protected readonly slug = this.selected.slug;

  private readonly requests = computed(() => {
    const id = this.projectId();
    return id === undefined ? undefined : this.store.releaseRequests()[id];
  });

  protected readonly pending = computed(() => this.requests()?.pending ?? []);

  /**
   * The pending requests with their lifecycle line and what in them needs a person; the ones
   * needing someone first, the rest in the answer's order.
   */
  protected readonly rows = computed(() => {
    const active = this.ci.active()?.runs;
    const rows = this.pending().map((request) => ({
      request,
      summary: lifecycleSummary(request),
      attention: attentionOf(request),
      active: activeRunsOf(request.id, active, [
        ...(request.pipeline?.phases ?? []).map((phase) => phase.runId),
        ...(request.qualityGates ?? []).map((gate) => gate.runId),
      ]),
    }));
    return [
      ...rows.filter((row) => row.attention.length),
      ...rows.filter((row) => !row.attention.length),
    ];
  });

  /** How many pending requests need a person: the badge shows these, in red, when there are any. */
  protected readonly attentionCount = computed(
    () => this.rows().filter((row) => row.attention.length).length,
  );

  /** How many are pending, once fetched; undefined before the first opening. */
  protected readonly count = computed(() =>
    this.requests()?.status === 'loaded' ? this.pending().length : undefined,
  );

  protected readonly state = computed((): LoadState => {
    const status = this.requests()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected chip(tone: ChipTone): string {
    return chipClass(tone);
  }

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id !== undefined) untracked(() => void this.store.loadReleaseRequests(id));
    });
    refreshOn({
      names: RELEASE_REQUEST_EVENTS,
      when: (event) => {
        const id = this.projectId();
        return id !== undefined && affectsReleaseRequests(event, id, this.pending());
      },
      refresh: () => {
        const id = this.projectId();
        if (id !== undefined) void this.store.refreshReleaseRequests(id);
      },
    });
    this.ci.followActive(() => this.pending().map((request) => request.repoId), inject(DestroyRef));
  }

  /**
   * On each opening: the targets for the runners and slots line and the active CI runs (each once,
   * and again after a failure), and the open project's requests if nothing has yet (opening the
   * menu after a failure).
   */
  protected load(): void {
    void this.targets.load();
    void this.ci.loadActive();
    const id = this.projectId();
    if (id !== undefined) void this.store.loadReleaseRequests(id);
  }
}
