import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, filter, map } from 'rxjs';
import { DomainEvents } from '$core/events/domain-events';
import { ProjectsStore } from '$core/projects/projects.store';
import {
  affectsReleaseRequests,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import { requestBadge } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
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
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { ReleaseConflictPanel } from '$patterns/release-requests/release-conflict/release-conflict';
import { ReleasePipeline } from '$patterns/release-requests/release-pipeline/release-pipeline';
import { ReleaseSourcesPanel } from '$patterns/release-requests/release-sources/release-sources';

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
 * The request comes from `ReleaseRequestStore`, with the commits its fold brought in and, once a
 * tag is cut, what it published; the release pipeline (or, from an older service, the plain gates)
 * with Approve and Decline. On a repository's request the pipeline follows the facts; on the estate
 * release it comes first, because there the open question is the approval. Domain events about the project's release requests refresh it
 * (at most once a second), in place of the old page's six-second poll. A request of the project's
 * wrapper repository is the project's estate release, and the page says so.
 */
@Component({
  selector: 'app-release-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    NgTemplateOutlet,
    PageLayoutComponent,
    ReleaseConflictPanel,
    ReleasePipeline,
    ReleaseSourcesPanel,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout>
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

            <app-release-sources class="mt-3" [request]="request" />

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

            <app-release-conflict [request]="request" />

            @if (released(request)) {
              <section class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
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
              </section>
            }

            <section class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
              <h2 class="m-0 mb-1 text-base font-semibold">What this release folds in</h2>
              <ui-spinner [state]="commitsState()" class="min-h-8">
                @let fold = view()?.commits?.value;
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (commit of fold?.commits ?? []; track commit.hash) {
                    <li class="flex flex-wrap items-baseline gap-2 text-sm">
                      <span class="font-mono text-charcoal-brown-600" [title]="commit.hash ?? ''">{{
                        commit.shortHash
                      }}</span>
                      <span class="min-w-48 flex-1 break-words text-charcoal-brown-950">{{
                        commit.message
                      }}</span>
                      <span class="text-xs whitespace-nowrap text-charcoal-brown-500">{{
                        commit.author
                      }}</span>
                      <span
                        class="text-xs whitespace-nowrap text-charcoal-brown-500"
                        [title]="instant(commit.date)"
                        >{{ ago(commit.date) }}</span
                      >
                    </li>
                  }
                </ul>
                <p
                  class="m-0 py-2 text-sm text-charcoal-brown-500"
                  [class]="fold && !fold.commits?.length ? 'block' : 'hidden'"
                >
                  {{ fold?.detail || 'Nothing was folded in.' }}
                </p>
              </ui-spinner>
            </section>

            @if (released(request)) {
              <section class="mt-4 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
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
                        <span class="break-all">{{ artifact.name }}</span>
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

            <!-- Declared once, placed where the page's question puts it. -->
            <ng-template #gatesSection>
              <ui-spinner [state]="buildsState()" class="mt-4 min-h-12">
                <app-release-pipeline [request]="request" [builds]="view()?.builds?.value ?? []" />
              </ui-spinner>
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

  protected readonly buildsState = computed(() => this.view()?.builds.status ?? 'loading');

  protected readonly artifactsState = computed(() => this.view()?.artifacts?.status ?? 'loading');

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
        if (repoId) void this.store.refresh(repoId, this.requestId());
      });
  }
}
