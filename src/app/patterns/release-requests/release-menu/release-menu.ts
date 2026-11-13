import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { activeRunsOf } from '$core/ci/active-runs';
import { buildOfRepository, BUILD_EVENTS } from '$core/ci/build-events';
import { ACTIVE_RUNS } from '$core/ci/ci.operations';
import type { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { isPendingRelease } from '$core/projects/projects.consumes';
import { SelectedProject } from '$core/projects/selected-project';
import { releaseRequestRef, requestTitle, requestTone } from '$core/projects/release-requests';
import { attentionOf, lifecycleSummary } from '$core/release-requests/release-lifecycle';
import { LifecycleLine } from '$ui/components/lifecycle-line/lifecycle-line';
import { chipClass, type ChipTone } from '$ui/components/chip/chip';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
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
 * The requests are the shell's (`ProjectReleaseRequests`, qits-2146), which hands the menu its
 * `qitsResource` (`requests`): read as soon as a project opens, so the button carries their count
 * right away (none when nothing is pending), one request for the shell, the menu and the Release
 * Requests page. An opening after a failed read reads them again.
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` about the open project → its requests, the
 * shell's resource's `refreshOn` (see `ProjectReleaseRequests`; the list answer is the only read,
 * so a row change reads it too), at most once a second, since one release sends several.
 * The panel starts with the runners and slots line (`RunnerSlots`), read on each opening until it
 * loads (`load()`).
 * Below a request with a queued or running CI run (`activeRunsOf`: its QA, release and gate runs,
 * its automations), a chip per kind links to the run in qits-ci (`ActiveRuns`). The active runs
 * are the menu's own `qitsResource` over `ACTIVE_RUNS` (`/ci/api/runs/active`), read on the first
 * opening and again on an opening after a failure, and again after `BUILD_EVENTS` of a pending
 * request's repository (`buildOfRepository`, the resource's `refreshOn`) once read. A refused read
 * shows no chip.
 * What it shows carries the data marks (qits-2141): the list is the requests' read, each row its
 * request (`qitsEntity` by `id`) with each value its field or the fields it is derived from; the
 * badge is derived from the answer's `requests`.
 * The button and the panel are `ui-dropdown`'s. Each request links to its page
 * (`/projects/<slug>/release-requests/<requestId>`); following the link closes the panel. The link
 * is a declared exit (`open-menu-release-request`, epic qits-2000), declared here rather than
 * handed down from the shell that draws the menu: like the shell's, a pattern's declarations are
 * app-wide. A request needing a person carries its first check's anchor as the fragment.
 */
@Component({
  selector: 'app-release-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActiveRuns,
    Dropdown,
    LifecycleLine,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    RunnerSlots,
    Spinner,
  ],
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
            ? 'bg-danger text-fg-on-accent'
            : 'bg-warning-soft text-warning-strong ring-1 ring-warning-line') +
          (count() ? '' : ' hidden')
        "
        aria-hidden="true"
        [qitsEntityList]="requests()"
        [fieldOf]="answer()"
        [qitsField]="marks.badge"
        >{{ attentionCount() || count() }}</span
      >
      <app-runner-slots dropdown-panel />
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 list-none p-0" [qitsEntityList]="requests()">
          @for (row of rows(); track row.request.id) {
            @let request = row.request;
            <li
              class="border-b border-line-subtle last:border-b-0"
              [class]="
                row.attention.length ? 'border-l-4 border-l-warning-line bg-warning-soft' : ''
              "
              [qitsEntity]="request"
              entityKey="id"
            >
              <a
                class="flex flex-col gap-1 px-3 py-2 no-underline hover:bg-surface-muted"
                [qitsExit]="opening.request"
                [exitParams]="{ slug: slug(), requestId: ref(request) }"
                [exitFragment]="row.attention[0]?.anchor"
                [attr.title]="
                  row.attention[0] ? row.attention[0].action + ': ' + row.attention[0].label : null
                "
                (click)="menu.close()"
              >
                <div class="flex items-baseline justify-between gap-2">
                  <span
                    class="truncate text-sm font-semibold text-fg"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['qualifiedId', 'repoName'] }"
                    >{{ request.qualifiedId ?? request.repoName }}</span
                  >
                  <span
                    class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                    [class]="chip(requestTone(request.state))"
                    [fieldOf]="request"
                    qitsField="state"
                    >{{ request.state }}</span
                  >
                </div>
                <span
                  class="truncate text-[0.8125rem] text-fg-soft"
                  [fieldOf]="request"
                  [qitsField]="marks.title"
                  >{{ title(request) }}</span
                >
                <ui-lifecycle-line
                  [points]="row.summary"
                  [spread]="true"
                  [fieldOf]="request"
                  [qitsField]="marks.lifecycle"
                />
              </a>
              <app-active-runs class="-mt-1 px-3 pb-2" [runs]="row.active" />
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-fg-muted"
          [class.hidden]="state() !== 'loaded' || pending().length > 0"
        >
          No pending release requests
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class ReleaseMenu {
  /** The open project's release requests: the shell's `ProjectReleaseRequests.resource`. */
  readonly requests = input.required<ProjectReleaseRequests['resource']>();

  /** How the requests' read stands, as the shell's resource says it. */
  readonly state = input<LoadState>('loading');

  private readonly selected = inject(SelectedProject);
  private readonly slots = viewChild(RunnerSlots);
  protected readonly requestTone = requestTone;
  protected readonly ref = releaseRequestRef;
  protected readonly title = requestTitle;
  protected readonly marks = MARKS;

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  /** The open project's slug, the request links' param. */
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** A request's row, linked to the request's page (epic qits-2000). */
  protected readonly opening = outcomes('open-menu-release-request', {
    request: exit('projects/:slug/release-requests/:requestId'),
  });

  /** The requests' answer, once read; an empty one before. */
  protected readonly answer = computed(() => {
    const read = this.requests();
    return (read.hasValue() ? read.value() : undefined) ?? { requests: [] };
  });

  protected readonly pending = computed((): readonly ReleaseRequestEntry[] =>
    (this.answer().requests ?? []).filter(isPendingRelease),
  );

  /** The menu was opened once: the active runs are read from then on. */
  private readonly opened = signal(false);

  /**
   * Every queued or running CI run, once the menu opened; read again after a build event of a
   * pending request's repository, once read.
   */
  private readonly active = qitsResource(ACTIVE_RUNS, () => (this.opened() ? {} : undefined), {
    refreshOn: {
      names: BUILD_EVENTS,
      when: (event): boolean =>
        this.active.hasValue() &&
        buildOfRepository(
          event,
          this.pending().map((request) => request.repoId),
        ),
    },
  });

  /**
   * The pending requests with their lifecycle line and what in them needs a person; the ones
   * needing someone first, the rest in the answer's order.
   */
  protected readonly rows = computed(() => {
    const active = this.active.hasValue() ? this.active.value()?.runs : undefined;
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

  /** How many are pending, once fetched; undefined before. */
  protected readonly count = computed(() =>
    this.state() === 'loaded' ? this.pending().length : undefined,
  );

  protected chip(tone: ChipTone): string {
    return chipClass(tone);
  }

  /**
   * On each opening: the targets for the runners and slots line and the active CI runs (each once,
   * and again after a failure), and the open project's requests again after a failed read.
   */
  protected load(): void {
    this.slots()?.load();
    untracked(() => {
      if (!this.opened()) this.opened.set(true);
      else if (this.active.status() === 'error') this.active.reload();
      const requests = this.requests();
      if (requests.status() === 'error') requests.reload();
    });
  }
}

/**
 * The marks of a row's values computed from its request: the title from what it carries
 * (`requestTitle`: its items, else its sources), the lifecycle line from its pipeline, gates and
 * automations (`lifecycleSummary`).
 */
const MARKS = {
  /** The badge counts the pending requests, or the ones needing a person (active runs aside). */
  badge: { derived: ['requests'] },
  title: { derived: ['items', 'sources'] },
  lifecycle: { derived: ['pipeline', 'qualityGates', 'automations', 'state'] },
} as const;
