import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, filter, map } from 'rxjs';
import { CiRunsStore } from '$core/ci/ci-runs.store';
import { DomainEvents } from '$core/events/domain-events';
import { ProjectsStore } from '$core/projects/projects.store';
import {
  affectsReleaseRequests,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import { requestBadge } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import type {
  ReleaseArtifact,
  ReleaseRequest,
} from '$core/release-requests/release-request.consumes';
import {
  formatInstant,
  formatRelativeTime,
  hasReleased,
  isSettled,
  NONE,
  priorityBadge,
  releaseDetail,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import {
  artifactLinks,
  releaseLinks,
  repositoryScope,
  type AppLink,
} from '$core/release-requests/release-links';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip } from '$ui/components/chip/chip';
import { CommitGraphView, type GraphEntry } from '$ui/components/commit-graph/commit-graph';
import { branchGraph, guessedGraph, hasParents } from '$core/release-requests/branch-graph';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { CommitChangesView } from '$patterns/release-requests/commit-changes/commit-changes';
import { ReleaseChangesView } from '$patterns/release-requests/release-changes/release-changes';
import { ReleaseLifecycle } from '$patterns/release-requests/release-lifecycle/release-lifecycle';
import { ReleaseRuns } from '$patterns/release-requests/release-runs/release-runs';
import { requestRuns } from '$core/release-requests/release-runs';
import { releaseTabOf, releaseTabs, type ReleaseTab } from '$core/release-requests/release-tabs';
import { ReleaseLaneHeader } from '$patterns/release-requests/release-lane-header/release-lane-header';
import { ReleaseWithdraw } from '$patterns/release-requests/release-withdraw/release-withdraw';

/** At most one refresh a second: one release sends several events. */
const REFRESH_DEBOUNCE_MS = 1_000;

const PRIORITY_TITLE =
  'The highest priority among this request’s branches. Nothing is reordered by it yet.';

const UNATTENDED_TITLE =
  'A machine asked for this release, so nobody is waiting on it. It has stopped and will only ' +
  'move again when somebody pushes a fix.';

/**
 * One release request, whole, at `/projects/<slug>/release-requests/<requestId>` (ported from
 * qits-projects-frontend's `release-request-detail-page`).
 *
 * Every read of a request is addressed by its repository, and the URL names only the request, so
 * the page finds the repository in the project's list of requests (`ProjectsStore`: the open
 * requests plus the last finalized). A request not in that list is "not found" here.
 *
 * Four tabs, in `?tab=`. The overview: the head, the facts, the release's whole lifecycle, the
 * release and what it published. Commits: the commits the fold brought in, as a graph under its
 * sources (each opens its changeset). CI runs: the request's runs in qits-ci, read when the tab
 * opens. Changes: what the fold changes, file by file (`?path=`). The lifecycle is on the
 * overview only; the head (title, chips, tabs) is on every tab.
 * The tab labels count the commits and, once read, the runs.
 * Withdraw sits in the page's actions while the request can be called off.
 *
 * On a repository's request the lifecycle follows the facts; on the project's estate release (its
 * wrapper repository) it comes first, because there the open question is the approval. Domain
 * events about the project's release requests refresh the page (at most once a second), in place
 * of the old page's six-second poll.
 */
@Component({
  selector: 'app-release-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    CommitChangesView,
    CommitGraphView,
    NgTemplateOutlet,
    PageLayoutComponent,
    ReleaseChangesView,
    ReleaseLifecycle,
    ReleaseRuns,
    ReleaseLaneHeader,
    ReleaseWithdraw,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout>
        @if (row(); as request) {
          <app-release-withdraw uiPageActions [request]="request" />
        }
        <div uiPageHeader class="flex min-w-0 flex-wrap items-baseline gap-2">
          <h1 class="m-0 min-w-48 flex-1 text-3xl leading-[1.1] font-bold break-words">
            {{ row()?.summary || 'Release request' }}
          </h1>
        </div>
        <p class="mt-0 mb-4 text-sm">
          <a
            class="text-ocean-deep-700 no-underline hover:underline"
            [routerLink]="['/projects', slug(), 'release-requests']"
            >← Release requests</a
          >
        </p>
        <p
          class="m-0 text-sm text-charcoal-brown-600"
          [class.hidden]="!(listState() === 'loaded' && !repoId())"
        >
          This project has no open or recently finalized release request {{ requestId() }}.
        </p>
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="!!listed() && !repoId()">
          @if (row(); as request) {
            @let badge = badgeOf(request);
            <div class="flex flex-wrap items-center gap-2">
              <ui-chip [label]="badge.label" [tone]="badge.tone" />
              @if (priority(request); as chip) {
                <ui-chip [label]="chip.label" [tone]="chip.tone" [title]="priorityTitle" />
              }
              @if (unattended(request)) {
                <ui-chip label="nobody watching" tone="waiting" [title]="unattendedTitle" />
              }
              <span class="font-semibold break-all text-charcoal-brown-800">{{
                request.repoName
              }}</span>
              @if (watching()) {
                <span class="text-xs whitespace-nowrap text-charcoal-brown-500" role="status"
                  >Watching for changes…</span
                >
              }
            </div>

            @if (wrapper()) {
              <p class="mt-2 mb-0 text-sm break-words text-charcoal-brown-700">
                This is the project's own estate release. What it releases is the project repository
                — the declaration of which commit of every component this project is made of —
                rather than a version of any one of them.
              </p>
            }

            @if (request.state === 'OBSOLETE') {
              <p
                class="mt-2 mb-0 rounded border border-charcoal-brown-200 bg-charcoal-brown-50 px-2 py-1.5 text-sm text-charcoal-brown-700"
                role="status"
              >
                A later release request for this repository took this one over before it finished,
                so nothing here is waiting on anybody and nothing on it can be changed.
                @if (request.supersededBy?.trim(); as replacement) {
                  <a
                    class="text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="['..', replacement]"
                    >Open the request that superseded it</a
                  >
                }
              </p>
            }

            <!-- The tab rides in ?tab=, so the path keeps meaning "which request". -->
            <nav
              class="mt-3 flex flex-wrap gap-1 border-b border-charcoal-brown-200"
              aria-label="Release request views"
            >
              @for (entry of tabs(); track entry.key) {
                <a
                  class="-mb-px border-b-2 px-3 py-1 text-sm no-underline"
                  [class]="
                    tab() === entry.key
                      ? 'border-ocean-deep-700 font-semibold text-charcoal-brown-950'
                      : 'border-transparent text-charcoal-brown-600 hover:text-charcoal-brown-950'
                  "
                  [attr.aria-current]="tab() === entry.key ? 'page' : null"
                  [routerLink]="[]"
                  [queryParams]="{ tab: entry.key }"
                  queryParamsHandling="merge"
                  >{{ entry.label
                  }}<span
                    class="ml-1 text-xs text-charcoal-brown-500"
                    [class.hidden]="entry.count === undefined"
                    >{{ entry.count }}</span
                  ></a
                >
              }
            </nav>

            @if (tab() === 'commits') {
              <section
                class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2"
                aria-labelledby="folds-in"
              >
                <h2 id="folds-in" class="m-0 mb-1 text-base font-semibold">
                  What this release folds in
                </h2>
                <ui-spinner [state]="commitsState()" class="min-h-8">
                  @let fold = view()?.commits?.value;
                  <p
                    class="m-0 mb-1 text-xs text-charcoal-brown-500"
                    [class]="fold?.commits?.length && !graph().known ? 'block' : 'hidden'"
                  >
                    The branch graph appears once the service sends each commit's parents. Until
                    then the commits are a plain list, newest first.
                  </p>
                  <div
                    class="mb-2 flex flex-wrap items-start gap-2"
                    [class.hidden]="!graph().graph.emptySources.length"
                  >
                    <span class="w-full text-xs text-charcoal-brown-500">{{
                      graph().known ? 'Sources without commits of their own:' : 'Sources:'
                    }}</span>
                    @for (name of graph().graph.emptySources; track name) {
                      <app-release-lane-header
                        class="w-36 rounded border border-charcoal-brown-200 px-1.5 py-1"
                        [lane]="{ label: name, kind: 'source' }"
                        [request]="request"
                      />
                    }
                  </div>
                  <ui-commit-graph
                    class="overflow-x-auto"
                    [graph]="graph().graph"
                    [entries]="graph().entries"
                    [expanded]="opened()"
                    [expansion]="changeset"
                    [lanes]="graph().lanes"
                    [laneWidth]="laneWidth"
                    [header]="laneHeader"
                    (toggle)="toggle($event)"
                    (more)="earlierFolds.set(!earlierFolds())"
                  />
                  <ng-template #laneHeader let-lane>
                    <app-release-lane-header [lane]="lane" [request]="request" />
                  </ng-template>
                  <ng-template #changeset let-hash>
                    <app-commit-changes [repoId]="repoId()" [sha]="hash" />
                  </ng-template>
                  <p
                    class="m-0 py-2 text-sm text-charcoal-brown-500"
                    [class]="fold && !fold.commits?.length ? 'block' : 'hidden'"
                  >
                    {{ fold?.detail || 'Nothing was folded in.' }}
                  </p>
                </ui-spinner>
              </section>
            } @else if (tab() === 'runs') {
              <app-release-runs
                class="mt-4"
                [request]="request"
                [builds]="view()?.builds?.value ?? []"
                [runs]="runs()?.runs ?? []"
                [state]="runs()?.status ?? 'loading'"
              />
            } @else if (tab() === 'changes') {
              <app-release-changes class="mt-4" [request]="request" />
            } @else {
              <!-- On the estate the open question is the approval, so the lifecycle comes first. -->
              @if (wrapper()) {
                <ng-container [ngTemplateOutlet]="gatesSection" />
              }
              <div
                class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-charcoal-brown-500"
              >
                <span
                  >folded onto <span class="font-mono">{{ request.backingBranch }}</span></span
                >
                <span
                  >merged
                  <span class="font-mono" [title]="foldTitle(request)">{{
                    short(request.mergedSha)
                  }}</span></span
                >
                <span>asked by {{ request.requester || none }}</span>
                @if (request.gateTicketId) {
                  <a
                    class="text-sunflower-gold-800 underline"
                    [routerLink]="['/projects', slug(), 'work']"
                    >a bug ticket was filed for this failure</a
                  >
                }
                <span [title]="instant(request.createdAt)">asked {{ ago(request.createdAt) }}</span>
                <span [title]="instant(request.updatedAt)"
                  >last change {{ ago(request.updatedAt) }}</span
                >
              </div>

              @if (detail(request); as sentence) {
                <p class="mt-2 mb-0 text-sm break-words text-charcoal-brown-700">{{ sentence }}</p>
              }

              @if (!wrapper()) {
                <ng-container [ngTemplateOutlet]="gatesSection" />
              }

              @if (released(request)) {
                <section
                  class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2"
                >
                  <h2 class="m-0 mb-1 text-base font-semibold">
                    {{ request.state === 'FINALIZED' ? 'Released and finalized' : 'Released' }}
                  </h2>
                  <p class="m-0 flex flex-wrap items-baseline gap-2">
                    <span class="font-mono font-semibold">{{ request.version || none }}</span>
                    <span class="text-xs text-charcoal-brown-500 italic">{{
                      request.mergedToMainAt ? 'on main' : 'not on main yet'
                    }}</span>
                    @if (request.releasedSha) {
                      <span class="text-xs text-charcoal-brown-500"
                        >released commit
                        <span class="font-mono" [title]="request.releasedSha">{{
                          short(request.releasedSha)
                        }}</span></span
                      >
                    }
                  </p>
                  <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-sm">
                    @for (link of releaseLinks(); track link.label) {
                      <li>
                        <a
                          class="text-ocean-deep-700 no-underline hover:underline"
                          [href]="link.href"
                          >{{ link.label }}
                          @if (link.label === 'The released commit') {
                            <span class="font-mono">{{ short(request.releasedSha) }}</span>
                          }
                        </a>
                      </li>
                    }
                  </ul>
                </section>
              }

              @if (released(request)) {
                <section
                  class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2"
                >
                  <h2 class="m-0 mb-1 text-base font-semibold">What it published</h2>
                  <ui-spinner [state]="artifactsState()" class="min-h-8">
                    @let published = view()?.artifacts?.value;
                    <p
                      class="m-0 mb-1 text-sm text-charcoal-brown-700"
                      [class]="published?.detail ? 'block' : 'hidden'"
                    >
                      {{ published?.detail }}
                    </p>
                    <ul class="m-0 flex list-none flex-col gap-1 p-0">
                      @for (artifact of published?.artifacts ?? []; track artifact.name) {
                        <li class="flex flex-wrap items-baseline gap-2 text-sm">
                          <span
                            class="rounded border border-charcoal-brown-200 bg-charcoal-brown-50 px-1.5 text-xs text-charcoal-brown-600"
                            >{{ artifact.type }}</span
                          >
                          @for (link of artifactLinks(artifact); track link.label) {
                            @if (link.href) {
                              <a
                                class="break-all text-ocean-deep-700 no-underline hover:underline"
                                [href]="link.href"
                                >{{ link.label }}</a
                              >
                            } @else {
                              <span class="break-all">{{ link.label }}</span>
                            }
                          }
                          <span class="font-mono text-charcoal-brown-500">{{
                            artifact.version
                          }}</span>
                        </li>
                      }
                    </ul>
                    <p
                      class="m-0 py-2 text-sm text-charcoal-brown-500"
                      [class]="
                        published && !published.artifacts?.length && !published.detail
                          ? 'block'
                          : 'hidden'
                      "
                    >
                      This repository publishes nothing of its own.
                    </p>
                  </ui-spinner>
                </section>
              }
            }

            <!-- Declared once, placed where the page's question puts it. -->
            <ng-template #gatesSection>
              <app-release-lifecycle class="mt-4" [request]="request" [slug]="slug()" />
            </ng-template>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ReleaseRequestPage {
  private readonly selected = inject(SelectedProject);
  private readonly projects = inject(ProjectsStore);
  private readonly repositories = inject(RepositoriesStore);
  private readonly store = inject(ReleaseRequestStore);
  private readonly ci = inject(CiRunsStore);

  protected readonly none = NONE;
  protected readonly badgeOf = requestBadge;
  protected readonly priority = (request: ReleaseRequest) => priorityBadge(request.priority);
  protected readonly detail = releaseDetail;
  protected readonly released = hasReleased;
  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = formatRelativeTime;
  protected readonly priorityTitle = PRIORITY_TITLE;
  protected readonly unattendedTitle = UNATTENDED_TITLE;

  /** The open tab, from `?tab=`: `commits`, `runs`, `changes`, or the overview. */
  protected readonly tab = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => releaseTabOf(params.get('tab')))),
    { initialValue: 'overview' as ReleaseTab },
  );

  /** The tabs, each with a count where it is known. */
  protected readonly tabs = computed(() => {
    const commits = this.view()?.commits?.value?.commits;
    const runs = this.runs();
    const request = this.row();
    const runCount =
      runs?.status === 'loaded' && request
        ? requestRuns(request, this.view()?.builds?.value ?? [], runs.runs).length
        : undefined;
    return releaseTabs({ commits: commits?.length, runs: runCount });
  });

  /** The request id in the URL. */
  protected readonly requestId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('requestId') ?? '')),
    { initialValue: '' },
  );

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  private readonly projectId = computed(() => this.selected.project()?.id);

  /** The project's list of requests, where the page finds the request's repository. */
  protected readonly listed = computed(() => {
    const id = this.projectId();
    return id ? this.projects.releaseRequests()[id] : undefined;
  });

  protected readonly listState = computed(() => this.listed()?.status);

  /** The request's repository, once the project's list names it; `''` before and if not. */
  protected readonly repoId = computed(() => {
    const id = this.requestId();
    return this.listed()?.requests.find((request) => request.id === id)?.repoId ?? '';
  });

  protected readonly view = computed(() => this.store.byId()[this.requestId()]);

  protected readonly row = computed(() => this.view()?.request.value);

  protected readonly state = computed((): LoadState => {
    if (this.listState() === 'error') return 'error';
    const status = this.view()?.request.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected readonly commitsState = computed(() => this.view()?.commits.status ?? 'loading');

  /** The repository's newest CI runs, where the request's runs are found. */
  protected readonly runs = computed(() => this.ci.byRepository()[this.repoId()]);

  protected readonly artifactsState = computed(() => this.view()?.artifacts?.status ?? 'loading');

  private readonly origins = inject(PlatformOrigins);

  /** A link with its address joined to its application's origin; no href when none is known. */
  private linked(link: AppLink): AppLink & { readonly href?: string } {
    const origin = link.app ? this.origins.page(link.app) : '';
    return { ...link, href: origin && link.path ? `${origin}${link.path}` : undefined };
  }

  /** `/<slug>/<group>/<repository>/`, where the platform's SPAs address the repository. */
  private readonly scope = computed(() => {
    const id = this.projectId();
    const entries = id ? this.repositories.byProject()[id]?.wrapper?.entries : undefined;
    const path = entries?.find((entry) => entry.repositoryId === this.repoId())?.path;
    return repositoryScope(this.slug(), path, this.row()?.repoName);
  });

  /** The release's tag, commit, deployment and train, where they can be addressed. */
  protected readonly releaseLinks = computed(() => {
    const request = this.row();
    if (!request) return [];
    return releaseLinks({
      slug: this.slug(),
      scope: this.scope(),
      repoId: request.repoId,
      repoName: request.repoName,
      version: request.version,
      releasedSha: request.releasedSha,
      deployable: this.view()?.artifacts?.value?.deployable === true,
    })
      .map((link) => this.linked(link))
      .filter((link) => !!link.href);
  });

  protected artifactLinks(artifact: ReleaseArtifact) {
    return artifactLinks(artifact, this.scope()).map((link) => this.linked(link));
  }

  /** A request of the project's wrapper repository: the project's own estate release. */
  protected readonly wrapper = computed(() => {
    const id = this.projectId();
    const wrapperId = id ? this.repositories.byProject()[id]?.wrapper?.repositoryId : undefined;
    return !!wrapperId && wrapperId === this.repoId();
  });

  /** The request can still move: its page follows the events. */
  protected readonly watching = computed(() => {
    const request = this.row();
    return !!request && !isSettled(request);
  });

  /** Each lane's width in the commit graph, in px: room for a branch name and its priority. */
  protected readonly laneWidth = 96;

  /** The earlier fold merges are shown (they are folded away at first). */
  protected readonly earlierFolds = signal(false);

  /**
   * The fold's commits as a graph. With every commit's parents, a branch graph (`branchGraph`):
   * the newest fold merge on the backing branch's lane pulling in a lane per source that owns
   * commits; sources without commits get a compact header above it. Without parents, a plain list
   * in one lane (`guessedGraph`), every source in the compact headers, and a note.
   *
   * TODO(qits-112): qits-projects is adding `commits[].parents`, `commits[].fold` and, on the
   * commits answer, `sources[].tipSha` and `foldParents` (`external/rr-commit-states`). Until the
   * client is regenerated they are read here as the answer arrives, outside `consume`'s lists;
   * then add them to `LIST_RELEASE_REQUEST_COMMITS`, so the pact binds them, and drop the casts.
   */
  protected readonly graph = computed(() => {
    const request = this.row();
    const commits = (this.view()?.commits?.value?.commits ?? []).filter((commit) => !!commit.hash);
    const withParents = commits as readonly ((typeof commits)[number] & {
      readonly parents?: readonly string[];
      readonly fold?: boolean;
    })[];
    const entry = (commit: (typeof commits)[number], label?: string): GraphEntry => ({
      hash: commit.hash ?? '',
      shortHash: commit.shortHash ?? '',
      subject: (commit.message ?? '').split('\n', 1)[0],
      author: commit.author ?? '',
      when: this.ago(commit.date),
      title: this.instant(commit.date),
      label,
    });
    // TODO(qits-112): read outside consume's lists until the client is regenerated (see above).
    const answered = this.view()?.commits?.value as
      { readonly sources?: readonly { name?: string; tipSha?: string | null }[] } | undefined;
    if (request && hasParents(withParents)) {
      const sources = answered?.sources ?? [];
      const graph = branchGraph({
        commits: withParents.map((commit) => ({
          hash: commit.hash ?? '',
          parents: commit.parents ?? [],
          fold: commit.fold,
        })),
        mergedSha: request.mergedSha ?? '',
        backingBranch: request.backingBranch ?? 'the fold',
        sources: sources.map((source) => ({ name: source.name ?? '', tipSha: source.tipSha })),
        showEarlierFolds: this.earlierFolds(),
      });
      const byHash = new Map(commits.map((commit) => [commit.hash ?? '', commit]));
      const entries = graph.shown.map((hash, index) => {
        const shown = entry(
          byHash.get(hash)!,
          graph.notYetFolded.has(hash) ? 'not yet folded' : undefined,
        );
        if (index !== 0 || graph.earlierFolds === 0) return shown;
        const more = this.earlierFolds()
          ? `Hide the ${graph.earlierFolds} earlier folds`
          : `${graph.earlierFolds} earlier ${graph.earlierFolds === 1 ? 'fold' : 'folds'}`;
        return { ...shown, more };
      });
      return { graph, entries, lanes: graph.lanes, known: true };
    }
    const graph = guessedGraph({
      commits: commits.map((commit) => ({ hash: commit.hash ?? '' })),
      backingBranch: request?.backingBranch ?? 'the fold',
      sources: (request?.sources ?? []).map((source) => ({ name: source.name ?? '' })),
    });
    return {
      graph,
      entries: commits.map((commit) => entry(commit)),
      lanes: graph.lanes,
      known: false,
    };
  });

  /** The commits whose changesets are open, by hash. */
  protected readonly opened = signal<ReadonlySet<string>>(new Set());

  protected toggle(hash: string): void {
    const next = new Set(this.opened());
    if (!next.delete(hash)) next.add(hash);
    this.opened.set(next);
  }

  protected foldTitle(request: ReleaseRequest): string {
    return request.mergedSha
      ? `${request.mergedSha} — the fold of this request's sources onto ${request.backingBranch}`
      : `Nothing has been folded onto ${request.backingBranch} yet`;
  }

  protected unattended(request: ReleaseRequest): boolean {
    return (
      request.unattended === true &&
      ['REJECTED', 'CONFLICTED', 'FAILED'].includes(request.state ?? '')
    );
  }

  constructor() {
    // In the browser only (the server render has no session cookie).
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.projectId();
      if (!browser || !id) return;
      untracked(() => {
        void this.projects.loadReleaseRequests(id);
        void this.repositories.load(id);
      });
    });
    effect(() => {
      const repoId = this.repoId();
      const requestId = this.requestId();
      if (browser && repoId && requestId) {
        untracked(() => void this.store.load(repoId, requestId));
      }
    });
    // The CI runs are read when their tab opens, not before.
    effect(() => {
      const repoId = this.repoId();
      if (browser && repoId && this.tab() === 'runs') {
        untracked(() => void this.ci.load(repoId));
      }
    });
    if (!browser) return;
    inject(DomainEvents)
      .on(RELEASE_REQUEST_EVENTS)
      .pipe(
        filter((event) => {
          const id = this.projectId();
          const request = this.row();
          return !!id && !!request && affectsReleaseRequests(event, id, [request]);
        }),
        debounceTime(REFRESH_DEBOUNCE_MS),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        const repoId = this.repoId();
        if (!repoId) return;
        void this.store.refresh(repoId, this.requestId());
        void this.ci.refresh(repoId);
      });
  }
}
