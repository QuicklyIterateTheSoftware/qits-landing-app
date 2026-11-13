import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { map } from 'rxjs';
import { activeRunsOf } from '$core/ci/active-runs';
import { buildOfRepository, BUILD_EVENTS } from '$core/ci/build-events';
import { REPOSITORY_RUNS, RUNS_LIMIT } from '$core/ci/ci.operations';
import type { EligibilityRead } from '$core/release-requests/approval-requirements';
import {
  OPEN_RELEASE_REQUEST,
  type OpenReleaseRequest,
} from '$core/release-requests/open-release-request';
import {
  APPROVAL_ELIGIBILITY,
  COMMIT_BUILDS,
  RELEASE_ARTIFACTS,
  RELEASE_COMMITS,
  RELEASE_REQUEST,
} from '$core/release-requests/release-request.operations';
import { loadState } from '$core/resources/load-state';
import { isMissing } from '$core/resources/resource-family';
import {
  affectsReleaseRequest,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import {
  FROZEN_TITLE,
  freezeFact,
  participantsOf,
  queuedBehind,
  queuedNext,
  requestBadge,
  requestItems,
} from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { PROJECT_REPOSITORIES } from '$core/repositories/repositories.operations';
import { movesWrapper } from '$core/repositories/wrapper-commits';
import type {
  ReleaseArtifact,
  ReleaseRequest,
} from '$core/release-requests/release-request.consumes';
import {
  DEFAULT_MAIN_BRANCH,
  formatInstant,
  formatRelativeTime,
  hasReleased,
  isSettled,
  NONE,
  priorityBadge,
  releaseDetail,
  shortShaOrNone,
  sourceMoves,
} from '$core/release-requests/release-request-model';
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
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { CommitChangesView } from '$patterns/release-requests/commit-changes/commit-changes';
import { ReleaseChangesView } from '$patterns/release-requests/release-changes/release-changes';
import { ReleaseLifecycle } from '$patterns/release-requests/release-lifecycle/release-lifecycle';
import { ReleaseRuns } from '$patterns/release-requests/release-runs/release-runs';
import { ActiveRuns } from '$patterns/release-requests/active-runs/active-runs';
import { RunReports } from '$patterns/release-requests/run-reports/run-reports';
import { requestRuns } from '$core/release-requests/release-runs';
import { currentFoldPhases } from '$core/release-requests/fold-truth';
import { releaseTabOf, releaseTabs, type ReleaseTab } from '$core/release-requests/release-tabs';
import { ReleaseLaneHeader } from '$patterns/release-requests/release-lane-header/release-lane-header';
import { ReleaseWithdraw } from '$patterns/release-requests/release-withdraw/release-withdraw';

const PRIORITY_TITLE =
  'The highest priority among this request’s branches. Nothing is reordered by it yet.';

const UNATTENDED_TITLE =
  'A machine asked for this release, so nobody is waiting on it. It has stopped and will only ' +
  'move again when somebody pushes a fix.';

/**
 * One release request, whole, at `/projects/<slug>/release-requests/<requestId>` (ported from
 * qits-projects-frontend's `release-request-detail-page`).
 *
 * The URL names only the request, by its uuid or its logical id (`qualifiedId`,
 * `<repository>-rr-<n>`), so the page reads that one request through its project, through its own
 * `qitsResource` over `RELEASE_REQUEST` (`getProjectReleaseRequest`, qits-2146), whatever its state
 * or age, in the browser only. The answer names the repository every later read and change is
 * addressed by: the fold's commits (`RELEASE_COMMITS`) and CI verdicts (`COMMIT_BUILDS`), read once
 * per fold; what it published (`RELEASE_ARTIFACTS`), read once released; what the viewer may
 * approve (`APPROVAL_ELIGIBILITY`), read once per fold and set of requirements; the repository's
 * newest runs (`REPOSITORY_RUNS`); and the project's repositories (`PROJECT_REPOSITORIES`: where
 * the repository is mounted, its main branch, which is the wrapper). Each is the page's own
 * resource. The page provides itself as `OPEN_RELEASE_REQUEST`: a change made below it (approve,
 * decline, withdraw, a priority, a move, an override, a waiver, a re-run, each a `qitsMutation`)
 * puts the request it answered in place of the one on show (`put`), and the reads that follow it
 * follow. The head names
 * the request by its logical id, and its title says what the request carries (qits-1673: its
 * items, each work item linked; the source branches on an older answer). The facts say who asked:
 * its participants, comma-joined. A request the project does not have (404) is "not found" here; a
 * read that fails otherwise says so, with Retry.
 *
 * Four tabs, in `?tab=`. The overview: the head, the facts, the release's whole lifecycle, the
 * reports of its test run and release run (failing tests first, coverage, the rest), the release
 * and what it published. Commits: the commits the fold brought in, as a graph under its sources
 * (each opens its changeset). Builds: the request's runs in qits-ci (also read for the overview,
 * to check its test phase). Changes: what the fold changes, file by file (`?path=`). The
 * lifecycle is on the overview only; the head (title, chips, tabs) is on every tab. The head also
 * links the request's queued or running CI runs, one per kind (`activeRunsOf`, `ActiveRuns`), from
 * the repository's runs, so they follow the same build events.
 *
 * Everything the page shows is of the request's current fold (`mergedSha`): gate states from the
 * request's own gates, a stale QA phase replaced from the runs (`currentFoldPhases`), reports only
 * of runs at that commit. A re-fold reads the fold's commits, verdicts and reports again.
 * The tab labels count the commits and, once read, the runs.
 * The facts say the soft feature freeze in force (epic qits-1580: counted branches of the
 * threshold, frozen, and which level set it, or "off") and link the request it is queued behind,
 * or the one queued behind it; the commit graph marks each source counted toward it or joined past
 * it.
 * Withdraw sits in the page's actions while the request can be called off. Each source's header
 * offers "Move to next request" where the branch may move (qits-1665, `ReleaseLaneHeader`), and
 * the overview lists the sources moved into or out of the request (`sourceMoves`: the branch, the
 * request it left and the one it joined, each linked, who moved it, why and when); an older
 * qits-projects answers no moves, and nothing is listed.
 *
 * Every link into the app is a declared exit (epic qits-2000): the work it carries
 * (`open-release-request-work`), the list (`leave-release-request`) and the other requests it names
 * (`open-related-release-request`). The tabs only change `?tab=` on this page, so they declare
 * nothing.
 *
 * On a repository's request the lifecycle follows the facts; on the project's estate release (its
 * wrapper repository) it comes first, because there the open question is the approval.
 *
 * Marks (qits-2141): the head's items and the request's content are the request (`qitsEntity` by
 * `id`, its source `RELEASE_REQUEST`), each value its field or the fields it is derived from; the
 * Commits tab names the commits' read, the published artifacts theirs (each an entity by `name`),
 * each moved source is one by its branch.
 *
 * Staleness (qits-1270), each resource's `refreshOn`: `RELEASE_REQUEST_EVENTS` that name this
 * request (`releaseRequestId`: `ReleaseRequestStateChanged`, `ReleaseRequestChanged`,
 * `SCMRelease`, its builds), a `SoftwareRelease` of its repository and version, a build of its
 * repository at its fold or tag, and while it is RELEASED a deployment of its version
 * (`affectsReleaseRequest`) → this request, at most once a second; its commits and verdicts are
 * read again only for a new fold (their params), its artifacts once. An event about another
 * request of the project reads nothing. Its repository's CI runs follow their own `BUILD_EVENTS`
 * (`buildOfRepository`), each run's reports theirs (`RunReports`, `buildOfRun`), and the project's
 * repositories a `SCMPublishCommit` to the wrapper's main branch (`movesWrapper`).
 */
@Component({
  selector: 'app-release-request-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: OPEN_RELEASE_REQUEST, useExisting: ReleaseRequestPage }],
  imports: [
    Chip,
    CommitChangesView,
    CommitGraphView,
    NgTemplateOutlet,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    ReleaseChangesView,
    ReleaseLifecycle,
    ReleaseRuns,
    ActiveRuns,
    RunReports,
    ReleaseLaneHeader,
    ReleaseWithdraw,
    RouterLink,
    LoadFailure,
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
          <h1
            class="m-0 flex min-w-48 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 text-3xl leading-[1.1] font-bold break-words"
          >
            @if (row(); as request) {
              @for (item of itemsOf(request); track item.key) {
                <span
                  class="inline-flex min-w-0 items-baseline gap-2"
                  data-item
                  [qitsEntity]="request"
                  entityKey="id"
                  [entitySource]="read"
                  [fieldOf]="request"
                  [qitsField]="marks.items"
                >
                  @if (item.qualifiedId) {
                    <a
                      class="font-mono text-xl whitespace-nowrap text-accent no-underline hover:underline"
                      [qitsExit]="work.item"
                      [exitParams]="{ slug: slug(), id: item.qualifiedId }"
                      data-work-item
                      >{{ item.qualifiedId }}</a
                    >
                  }
                  <span class="break-words">{{ item.text }}</span>
                </span>
              } @empty {
                Release request
              }
            } @else {
              Release request
            }
          </h1>
        </div>
        <p class="mt-0 mb-4 text-sm">
          <a
            class="text-accent no-underline hover:underline"
            [qitsExit]="leaving.list"
            [exitParams]="{ slug: slug() }"
            >← Release requests</a
          >
        </p>
        <p class="m-0 text-sm text-fg-soft" [class.hidden]="!missing()">
          This project has no release request {{ requestId() }}.
        </p>
        <ui-load-failure
          message="This release request could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="missing() || state() === 'error'"
        >
          @if (row(); as request) {
            <div class="contents" [qitsEntity]="request" entityKey="id" [entitySource]="read">
              @let badge = badgeOf(request);
              <div class="flex flex-wrap items-center gap-2">
                <ui-chip
                  [label]="badge.label"
                  [tone]="badge.tone"
                  [fieldOf]="request"
                  [qitsField]="marks.badge"
                />
                @if (priority(request); as chip) {
                  <ui-chip
                    [label]="chip.label"
                    [tone]="chip.tone"
                    [title]="priorityTitle"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['priority'] }"
                  />
                }
                @if (unattended(request)) {
                  <ui-chip label="nobody watching" tone="waiting" [title]="unattendedTitle" />
                }
                <app-active-runs [runs]="activeRuns()" />
                <span
                  class="font-semibold break-all text-fg"
                  [fieldOf]="request"
                  [qitsField]="{ derived: ['qualifiedId', 'repoName'] }"
                  >{{ request.qualifiedId ?? request.repoName }}</span
                >
                @if (watching()) {
                  <span class="text-xs whitespace-nowrap text-fg-muted" role="status"
                    >Watching for changes…</span
                  >
                }
              </div>

              @if (wrapper()) {
                <p class="mt-2 mb-0 text-sm break-words text-fg-soft">
                  This is the project's own estate release. What it releases is the project
                  repository — the declaration of which commit of every component this project is
                  made of — rather than a version of any one of them.
                </p>
              }

              @if (request.state === 'OBSOLETE') {
                <p
                  class="mt-2 mb-0 rounded border border-line bg-surface-subtle px-2 py-1.5 text-sm text-fg-soft"
                  role="status"
                >
                  A later release request for this repository took this one over before it finished,
                  so nothing here is waiting on anybody and nothing on it can be changed.
                  @if (request.supersededBy?.trim(); as replacement) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="related.supersededBy"
                      [exitParams]="{ slug: slug(), requestId: replacement }"
                      >Open the request that superseded it</a
                    >
                  }
                </p>
              }

              <!-- The tab rides in ?tab=, so the path keeps meaning "which request". -->
              <nav
                class="mt-3 flex flex-wrap gap-1 border-b border-line"
                aria-label="Release request views"
              >
                @for (entry of tabs(); track entry.key) {
                  <a
                    class="-mb-px border-b-2 px-3 py-1 text-sm no-underline"
                    [class]="
                      tab() === entry.key
                        ? 'border-accent font-semibold text-fg'
                        : 'border-transparent text-fg-soft hover:text-fg'
                    "
                    [attr.aria-current]="tab() === entry.key ? 'page' : null"
                    [routerLink]="[]"
                    [queryParams]="{ tab: entry.key }"
                    queryParamsHandling="merge"
                    [fieldOf]="request"
                    [qitsField]="marks.tabs"
                    >{{ entry.label
                    }}<span
                      class="ml-1 text-xs text-fg-muted"
                      [class.hidden]="entry.count === undefined"
                      >{{ entry.count }}</span
                    ></a
                  >
                }
              </nav>

              @if (tab() === 'commits') {
                <section
                  class="mt-4 rounded-md border border-line bg-surface px-3 py-2"
                  aria-labelledby="folds-in"
                  [qitsEntityList]="commits"
                >
                  <h2 id="folds-in" class="m-0 mb-1 text-base font-semibold">
                    What this release folds in
                  </h2>
                  <ui-spinner [state]="commitsState()" class="min-h-8">
                    @let fold = commitsAnswer();
                    <p
                      class="m-0 mb-1 text-xs text-fg-muted"
                      [class]="fold?.commits?.length && !graph().known ? 'block' : 'hidden'"
                    >
                      The branch graph appears once the service sends each commit's parents. Until
                      then the commits are a plain list, newest first.
                    </p>
                    <div
                      class="mb-2 flex flex-wrap items-start gap-2"
                      [class.hidden]="!graph().graph.emptySources.length"
                    >
                      <span
                        class="w-full text-xs text-fg-muted"
                        [fieldOf]="request"
                        [qitsField]="marks.graph"
                        >{{
                          graph().known ? 'Sources without commits of their own:' : 'Sources:'
                        }}</span
                      >
                      @for (name of graph().graph.emptySources; track name) {
                        <app-release-lane-header
                          class="w-36 rounded border border-line px-1.5 py-1"
                          [lane]="{ label: name, kind: 'source' }"
                          [request]="request"
                          [mainBranch]="mainBranch()"
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
                      [project]="slug()"
                      (toggle)="toggle($event)"
                      (more)="earlierFolds.set(!earlierFolds())"
                      [fieldOf]="request"
                      [qitsField]="marks.graph"
                    />
                    <ng-template #laneHeader let-lane>
                      <app-release-lane-header
                        [lane]="lane"
                        [request]="request"
                        [mainBranch]="mainBranch()"
                      />
                    </ng-template>
                    <ng-template #changeset let-hash>
                      <app-commit-changes
                        [repoId]="repoId()"
                        [sha]="hash"
                        [parent]="firstParent(hash)"
                      />
                    </ng-template>
                    <p
                      class="m-0 py-2 text-sm text-fg-muted"
                      [class]="fold && !fold.commits?.length ? 'block' : 'hidden'"
                      [fieldOf]="request"
                      [qitsField]="{ derived: [] }"
                    >
                      {{ fold?.detail || 'Nothing was folded in.' }}
                    </p>
                  </ui-spinner>
                </section>
              } @else if (tab() === 'runs') {
                <app-release-runs
                  class="mt-4"
                  [request]="request"
                  [builds]="foldBuilds()"
                  [runs]="runs().runs"
                  [state]="runs().status"
                />
              } @else if (tab() === 'changes') {
                <app-release-changes class="mt-4" [request]="request" [slug]="slug()" />
              } @else {
                <!-- On the estate the open question is the approval, so the lifecycle comes first. -->
                @if (wrapper()) {
                  <ng-container [ngTemplateOutlet]="gatesSection" />
                }
                <div
                  class="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-fg-muted"
                >
                  <span
                    >folded onto
                    <span class="font-mono" [fieldOf]="request" qitsField="backingBranch">{{
                      request.backingBranch
                    }}</span></span
                  >
                  <span
                    >merged
                    <span
                      class="font-mono"
                      [title]="foldTitle(request)"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['mergedSha'] }"
                      >{{ short(request.mergedSha) }}</span
                    ></span
                  >
                  <span
                    data-participants
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['participants', 'sources'] }"
                    >asked by {{ participants(request) }}</span
                  >
                  @if (request.gateTicketId) {
                    <a
                      class="text-warning underline"
                      [qitsExit]="work.gateTicket"
                      [exitParams]="{ slug: slug() }"
                      >a bug ticket was filed for this failure</a
                    >
                  }
                  <span
                    [title]="instant(request.createdAt)"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['createdAt'] }"
                    >asked {{ ago(request.createdAt) }}</span
                  >
                  <span
                    [title]="instant(request.updatedAt)"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['updatedAt'] }"
                    >last change {{ ago(request.updatedAt) }}</span
                  >
                  @if (freeze(request); as fact) {
                    <span
                      [title]="frozenTitle"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['featureFreeze'] }"
                      >feature freeze: {{ fact }}</span
                    >
                  }
                  @if (behind(request); as ahead) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="related.queuedBehind"
                      [exitParams]="{ slug: slug(), requestId: ahead }"
                      title="Held back by the feature freeze: this request folds and gates nothing until the one ahead of it has released or been withdrawn"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['queuedBehindQualifiedId', 'queuedBehind'] }"
                      >queued behind <span class="font-mono">{{ ahead }}</span></a
                    >
                  }
                  @if (next(request); as after) {
                    <a
                      class="text-accent no-underline hover:underline"
                      [qitsExit]="related.queuedNext"
                      [exitParams]="{ slug: slug(), requestId: after }"
                      title="The request queued behind this one: new asks land there while this one is frozen"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['queuedNextQualifiedId', 'queuedNext'] }"
                      >next: <span class="font-mono">{{ after }}</span></a
                    >
                  }
                </div>

                @if (detail(request); as sentence) {
                  <p
                    class="mt-2 mb-0 text-sm break-words text-fg-soft"
                    [fieldOf]="request"
                    [qitsField]="{ derived: ['detail'] }"
                  >
                    {{ sentence }}
                  </p>
                }

                @let moved = moves(request);
                @if (moved.length) {
                  <section
                    class="mt-4 rounded-md border border-line bg-surface px-3 py-2"
                    aria-labelledby="source-moves"
                  >
                    <h2 id="source-moves" class="m-0 mb-1 text-base font-semibold">
                      Moved sources
                    </h2>
                    <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                      @for (move of moved; track $index) {
                        <li
                          class="flex flex-wrap items-baseline gap-x-2"
                          data-source-move
                          [qitsEntity]="move"
                          entityKey="branch"
                        >
                          <span
                            class="font-mono font-semibold break-all"
                            [fieldOf]="move"
                            qitsField="branch"
                            >{{ move.branch }}</span
                          >
                          <span class="text-fg-soft">
                            @if (move.fromQualifiedId) {
                              <a
                                class="font-mono text-accent no-underline hover:underline"
                                [qitsExit]="related.movedFrom"
                                [exitParams]="{ slug: slug(), requestId: move.fromQualifiedId }"
                                [fieldOf]="move"
                                qitsField="fromQualifiedId"
                                >{{ move.fromQualifiedId }}</a
                              >
                            } @else {
                              {{ none }}
                            }
                            →
                            @if (move.toQualifiedId) {
                              <a
                                class="font-mono text-accent no-underline hover:underline"
                                [qitsExit]="related.movedTo"
                                [exitParams]="{ slug: slug(), requestId: move.toQualifiedId }"
                                [fieldOf]="move"
                                qitsField="toQualifiedId"
                                >{{ move.toQualifiedId }}</a
                              >
                            } @else {
                              {{ none }}
                            }
                          </span>
                          <span
                            class="text-xs text-fg-muted"
                            [fieldOf]="move"
                            [qitsField]="{ derived: ['movedBy'] }"
                            >by {{ move.movedBy || none }}</span
                          >
                          <span
                            class="text-xs text-fg-muted"
                            [title]="instant(move.movedAt)"
                            [fieldOf]="move"
                            [qitsField]="{ derived: ['movedAt'] }"
                            >{{ ago(move.movedAt) }}</span
                          >
                          @if (move.reason) {
                            <span
                              class="w-full break-words text-fg-soft"
                              [fieldOf]="move"
                              qitsField="reason"
                              >{{ move.reason }}</span
                            >
                          }
                        </li>
                      }
                    </ul>
                  </section>
                }

                @if (!wrapper()) {
                  <ng-container [ngTemplateOutlet]="gatesSection" />
                }

                @if (released(request)) {
                  <section class="mt-4 rounded-md border border-line bg-surface px-3 py-2">
                    <h2
                      class="m-0 mb-1 text-base font-semibold"
                      [fieldOf]="request"
                      [qitsField]="{ derived: ['state'] }"
                    >
                      {{ request.state === 'FINALIZED' ? 'Released and finalized' : 'Released' }}
                    </h2>
                    <p class="m-0 flex flex-wrap items-baseline gap-2">
                      <span
                        class="font-mono font-semibold"
                        [fieldOf]="request"
                        [qitsField]="{ derived: ['version'] }"
                        >{{ request.version || none }}</span
                      >
                      <span
                        class="text-xs text-fg-muted italic"
                        [fieldOf]="request"
                        [qitsField]="{ derived: ['mergedToMainAt'] }"
                        >{{ request.mergedToMainAt ? 'on main' : 'not on main yet' }}</span
                      >
                      @if (request.releasedSha) {
                        <span class="text-xs text-fg-muted"
                          >released commit
                          <span
                            class="font-mono"
                            [title]="request.releasedSha"
                            [fieldOf]="request"
                            [qitsField]="{ derived: ['releasedSha'] }"
                            >{{ short(request.releasedSha) }}</span
                          ></span
                        >
                      }
                    </p>
                    <ul
                      class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-sm"
                      [fieldOf]="request"
                      [qitsField]="marks.releaseLinks"
                    >
                      @for (link of releaseLinks(); track link.label) {
                        <li>
                          <a class="text-accent no-underline hover:underline" [href]="link.href"
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
                    class="mt-4 rounded-md border border-line bg-surface px-3 py-2"
                    [qitsEntityList]="artifacts"
                  >
                    <h2 class="m-0 mb-1 text-base font-semibold">What it published</h2>
                    <ui-spinner [state]="artifactsState()" class="min-h-8">
                      @let shown = published();
                      <p
                        class="m-0 mb-1 text-sm text-fg-soft"
                        [class]="shown?.detail ? 'block' : 'hidden'"
                        [fieldOf]="request"
                        [qitsField]="{ derived: [] }"
                      >
                        {{ shown?.detail }}
                      </p>
                      <ul class="m-0 flex list-none flex-col gap-1 p-0">
                        @for (artifact of shown?.artifacts ?? []; track artifact.name) {
                          <li
                            class="flex flex-wrap items-baseline gap-2 text-sm"
                            [qitsEntity]="artifact"
                            entityKey="name"
                          >
                            <span
                              class="rounded border border-line bg-surface-subtle px-1.5 text-xs text-fg-soft"
                              [fieldOf]="artifact"
                              qitsField="type"
                              >{{ artifact.type }}</span
                            >
                            @for (link of artifactLinks(artifact); track link.label) {
                              @if (link.href) {
                                <a
                                  class="break-all text-accent no-underline hover:underline"
                                  [href]="link.href"
                                  [fieldOf]="artifact"
                                  [qitsField]="marks.artifactLink"
                                  >{{ link.label }}</a
                                >
                              } @else {
                                <span
                                  class="break-all"
                                  [fieldOf]="artifact"
                                  [qitsField]="marks.artifactLink"
                                  >{{ link.label }}</span
                                >
                              }
                            }
                            <span
                              class="font-mono text-fg-muted"
                              [fieldOf]="artifact"
                              qitsField="version"
                              >{{ artifact.version }}</span
                            >
                          </li>
                        }
                      </ul>
                      <p
                        class="m-0 py-2 text-sm text-fg-muted"
                        [class]="
                          shown && !shown.artifacts?.length && !shown.detail ? 'block' : 'hidden'
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
                <app-release-lifecycle
                  class="mt-4"
                  [request]="current() ?? request"
                  [slug]="slug()"
                  [eligibility]="eligibility()"
                />
                @for (run of reportRuns(); track run.runId) {
                  <app-run-reports class="mt-4" [runId]="run.runId" [title]="run.title" />
                }
                <p
                  class="mt-4 mb-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg-soft"
                  [class]="noFinishedBuild() ? 'block' : 'hidden'"
                >
                  No finished build of this fold yet.
                </p>
              </ng-template>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ReleaseRequestPage implements OpenReleaseRequest {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

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
  protected readonly freeze = freezeFact;
  protected readonly frozenTitle = FROZEN_TITLE;
  protected readonly behind = queuedBehind;
  protected readonly next = queuedNext;
  protected readonly participants = (request: ReleaseRequest) => participantsOf(request, NONE);
  /** The sources moved into or out of the request (qits-1665); none on an older answer. */
  protected readonly moves = sourceMoves;
  /** What the request carries, as the head names it (qits-1673). */
  protected readonly itemsOf = requestItems;
  protected readonly marks = MARKS;

  /** The open tab, from `?tab=`: `commits`, `runs`, `changes`, or the overview. */
  protected readonly tab = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => releaseTabOf(params.get('tab')))),
    { initialValue: 'overview' as ReleaseTab },
  );

  /** The tabs, each with a count where it is known. */
  protected readonly tabs = computed(() => {
    const commits = this.commitsAnswer()?.commits;
    const runs = this.runs();
    const request = this.row();
    const runCount =
      runs.status === 'loaded' && request
        ? requestRuns(request, this.foldBuilds(), runs.runs).length
        : undefined;
    return releaseTabs({ commits: commits?.length, runs: runCount });
  });

  /** The request id in the URL: its uuid or its logical id (`<repository>-rr-<n>`). */
  protected readonly requestId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('requestId') ?? '')),
    { initialValue: '' },
  );

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The open project's id, in the browser only (the server render holds no token). */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /**
   * The request, read through its project by the reference the URL names (`RELEASE_REQUEST`); read
   * again after an event about it (`affectsReleaseRequest`, see the staleness note).
   */
  protected readonly read = qitsResource(
    RELEASE_REQUEST,
    () => {
      const projectId = this.projectId();
      const ref = this.requestId();
      return projectId && ref ? { path: { projectId, ref } } : undefined;
    },
    {
      refreshOn: {
        names: RELEASE_REQUEST_EVENTS,
        when: (event): boolean => {
          const request = this.shownRequest();
          return !!request && affectsReleaseRequest(event, request);
        },
      },
    },
  );

  /** The read's answer, once read (and kept while a read again is on its way). */
  protected readonly answer = computed(() =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  /** The request, once read. */
  protected readonly row = computed(() => this.answer()?.request);

  /** The request on show, as the events about it are told apart (a signal of its own type). */
  private readonly shownRequest = computed((): ReleaseRequest | undefined => this.row());

  /** The request's repository, uuid and fold: what every read after it is addressed by. */
  private readonly address = {
    repoId: computed(() => this.row()?.repoId ?? ''),
    requestId: computed(() => this.row()?.id ?? ''),
  };

  /** The request's current fold (`mergedSha`); `''` while nothing is folded. */
  private readonly fold = computed(() => this.row()?.mergedSha ?? '');

  /** The commits the fold brought in, read once per fold. */
  protected readonly commits = qitsResource(RELEASE_COMMITS, () => {
    const repoId = this.address.repoId();
    const requestId = this.address.requestId();
    this.fold();
    return repoId && requestId ? { path: { repoId, requestId } } : undefined;
  });

  protected readonly commitsAnswer = computed(() =>
    this.commits.hasValue() ? this.commits.value() : undefined,
  );

  /** The CI verdicts on the fold, read once per fold; none while nothing is folded. */
  private readonly builds = qitsResource(COMMIT_BUILDS, () => {
    const repoId = this.address.repoId();
    const commitHash = this.fold();
    return repoId && commitHash ? { path: { repoId, commitHash } } : undefined;
  });

  /** The request was released: a tag is cut, so what it published is read, once. */
  private readonly tagCut = computed(() => {
    const request = this.row();
    return !!request && hasReleased(request);
  });

  /** What the release published, read once a tag is cut. */
  protected readonly artifacts = qitsResource(RELEASE_ARTIFACTS, () => {
    const repoId = this.address.repoId();
    const requestId = this.address.requestId();
    return this.tagCut() && repoId && requestId ? { path: { repoId, requestId } } : undefined;
  });

  protected readonly published = computed(() =>
    this.artifacts.hasValue() ? this.artifacts.value() : undefined,
  );

  /**
   * The fold and the requirement ids what the viewer may approve depends on (epic qits-1038); `''`
   * while the request carries no requirements, and then nothing is read.
   */
  private readonly eligibilityOf = computed(() => {
    const requirements = this.row()?.approvalRequirements;
    return Array.isArray(requirements) && requirements.length > 0
      ? [this.fold(), ...requirements.map((requirement) => requirement.id ?? '')].join(' ')
      : '';
  });

  /** What the viewer may approve, read once per fold and set of requirements. */
  private readonly eligibilityRead = qitsResource(APPROVAL_ELIGIBILITY, () => {
    const repoId = this.address.repoId();
    const requestId = this.address.requestId();
    return this.eligibilityOf() && repoId && requestId
      ? { path: { repoId, requestId } }
      : undefined;
  });

  /**
   * The eligibility as the lifecycle takes it: none while the request carries no requirements; an
   * answer without an eligibility (an older qits-projects) is a failed read, drawn as before.
   */
  protected readonly eligibility = computed((): EligibilityRead => {
    if (!this.eligibilityOf()) return undefined;
    const read = this.eligibilityRead;
    if (read.status() === 'error') return { status: 'error' };
    if (!read.hasValue()) return { status: 'loading' };
    const value = read.value()?.eligibility;
    return value ? { status: 'loaded', value } : { status: 'error' };
  });

  /** The repository's newest CI runs, where the request's runs are found. */
  private readonly repositoryRuns = qitsResource(
    REPOSITORY_RUNS,
    () => {
      const repositoryId = this.address.repoId();
      return repositoryId ? { query: { repositoryId, limit: RUNS_LIMIT } } : undefined;
    },
    {
      refreshOn: {
        names: BUILD_EVENTS,
        when: (event): boolean => buildOfRepository(event, [this.address.repoId()]),
      },
    },
  );

  /** The project's repositories: where each is mounted in the wrapper, and their main branches. */
  private readonly repositories = qitsResource(
    PROJECT_REPOSITORIES,
    () => {
      const projectId = this.projectId();
      return projectId ? { path: { projectId } } : undefined;
    },
    {
      refreshOn: {
        names: ['SCMPublishCommit'],
        when: (event): boolean => movesWrapper(event, this.projectRepositories()),
      },
    },
  );

  private readonly projectRepositories = computed(() =>
    this.repositories.hasValue() ? this.repositories.value() : undefined,
  );

  /** Shows a change's answer in place of the request on show, when it is that request. */
  put(request: ReleaseRequest): void {
    const shown = this.answer()?.request;
    if (!shown || !request.id || request.id !== shown.id) return;
    this.read.set({ request: { ...request, qualifiedId: shown.qualifiedId } });
  }

  /** Reads the request again. */
  reload(): void {
    this.read.reload();
  }

  /**
   * The work the page links (epic qits-2000): the work item an item of the head names, and, under
   * the facts, the project's work where a failed gate filed a bug ticket.
   */
  protected readonly work = outcomes('open-release-request-work', {
    item: exit('projects/:slug/work/detail/:id'),
    gateTicket: exit('projects/:slug/work'),
  });

  /** "← Release requests": back to the project's release requests (epic qits-2000). */
  protected readonly leaving = outcomes('leave-release-request', {
    list: exit('projects/:slug/release-requests'),
  });

  /**
   * The other requests the page links (epic qits-2000): the one that superseded an obsolete
   * request, the one it is queued behind or the one queued behind it (the feature freeze), and
   * the requests a moved source left and joined.
   */
  protected readonly related = outcomes('open-related-release-request', {
    supersededBy: exit('projects/:slug/release-requests/:requestId'),
    queuedBehind: exit('projects/:slug/release-requests/:requestId'),
    queuedNext: exit('projects/:slug/release-requests/:requestId'),
    movedFrom: exit('projects/:slug/release-requests/:requestId'),
    movedTo: exit('projects/:slug/release-requests/:requestId'),
  });

  /** The request's repository, from its answer; `''` until it is read. */
  protected readonly repoId = this.address.repoId;

  /** The project has no such request: qits-projects answered 404. */
  protected readonly missing = computed(() => isMissing(this.read));

  protected readonly state = computed((): LoadState =>
    this.missing() ? 'loading' : loadState(this.read),
  );

  /** Reads the request again after a failed read. */
  protected retry(): void {
    this.read.reload();
  }

  protected readonly commitsState = computed((): LoadState => loadState(this.commits));

  /**
   * The request as the page shows it: only its current fold (`mergedSha`). A QA phase that names a
   * run of an earlier fold (a race in qits-projects, fixed but not yet released) is replaced from
   * qits-ci's runs (`currentFoldPhases`).
   */
  protected readonly current = computed(() => {
    const request = this.row();
    const runs = this.runs();
    return request
      ? currentFoldPhases(request, runs.status === 'loaded' ? runs.runs : undefined)
      : undefined;
  });

  /** The CI verdicts on the request's current fold; none while nothing is folded. */
  protected readonly foldBuilds = computed(() =>
    this.fold() && this.builds.hasValue() ? (this.builds.value()?.builds ?? []) : [],
  );

  /**
   * The runs whose reports the overview shows, all of the current fold: its test run; while that
   * still runs, the newest finished build of the same commit (`foldBuilds`); then the release run.
   */
  protected readonly reportRuns = computed(() => {
    const phases = this.current()?.pipeline?.phases ?? [];
    const phaseOf = (phase: string) => phases.find((entry) => entry.phase === phase);
    const qa = phaseOf('QA');
    const runs: { runId: string; title: string }[] = [];
    if (qa?.runId) runs.push({ runId: qa.runId, title: 'Test run reports' });
    if (this.testRunning()) {
      const finished = this.foldBuilds().find(
        (build) => !!build.runId && build.runId !== qa?.runId,
      );
      if (finished?.runId) {
        runs.push({
          runId: finished.runId,
          title: `Last finished build of this fold (${(finished.status ?? '').toLowerCase()})`,
        });
      }
    }
    const publish = phaseOf('PUBLISH')?.runId;
    if (publish) runs.push({ runId: publish, title: 'Release run reports' });
    return runs;
  });

  /** The fold's test run has not finished (or not started). */
  private readonly testRunning = computed(() => {
    const qa = this.current()?.pipeline?.phases?.find((phase) => phase.phase === 'QA');
    return !qa || qa.state === 'RUNNING' || qa.state === 'PENDING';
  });

  /** The fold's test run still runs and no build of this fold has finished yet. */
  protected readonly noFinishedBuild = computed(
    () => !!this.row()?.mergedSha && this.testRunning() && this.foldBuilds().length === 0,
  );

  /**
   * The request's queued or running CI runs, one per kind, from the repository's newest runs: the
   * head links them.
   */
  protected readonly activeRuns = computed(() => {
    const request = this.row();
    const runs = this.runs();
    if (!request || runs.status !== 'loaded') return [];
    const named = requestRuns(request, this.foldBuilds(), runs.runs);
    return activeRunsOf(
      request.id,
      runs.runs,
      named.map((entry) => entry.id),
    );
  });

  /** The repository's newest CI runs, as the Builds tab and the head's chips take them. */
  protected readonly runs = computed(() => {
    const read = this.repositoryRuns;
    const runs = read.hasValue() ? (read.value()?.runs ?? []) : [];
    return { status: loadState(read), runs };
  });

  protected readonly artifactsState = computed((): LoadState => loadState(this.artifacts));

  private readonly origins = inject(PlatformOrigins);

  /** A link with its address joined to its application's origin; no href when none is known. */
  private linked(link: AppLink): AppLink & { readonly href?: string } {
    const origin = link.app ? this.origins.page(link.app) : '';
    return { ...link, href: origin && link.path ? `${origin}${link.path}` : undefined };
  }

  /** `/<slug>/<group>/<repository>/`, where the platform's SPAs address the repository. */
  private readonly scope = computed(() => {
    const entries = this.projectRepositories()?.wrapper?.entries;
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
      deployable: this.published()?.deployable === true,
    })
      .map((link) => this.linked(link))
      .filter((link) => !!link.href);
  });

  protected artifactLinks(artifact: ReleaseArtifact) {
    return artifactLinks(artifact, this.scope()).map((link) => this.linked(link));
  }

  /**
   * The request's repository's default branch, which no source move takes away (qits-1665): from
   * the project's repositories, `main` until they are read.
   */
  protected readonly mainBranch = computed(() => {
    const entries = this.projectRepositories()?.entries;
    const repository = entries?.find((entry) => entry.repository?.id === this.repoId())?.repository;
    return repository?.mainBranch?.trim() || DEFAULT_MAIN_BRANCH;
  });

  /** A request of the project's wrapper repository: the project's own estate release. */
  protected readonly wrapper = computed(() => {
    const wrapperId = this.projectRepositories()?.wrapper?.repositoryId;
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

  /** Each of the fold's commits' first parent, by hash: where an opened commit's images were before. */
  private readonly firstParents = computed(
    () =>
      new Map(
        (this.commitsAnswer()?.commits ?? []).map((commit) => [
          commit.hash ?? '',
          commit.parents?.[0],
        ]),
      ),
  );

  protected firstParent(hash: string): string | undefined {
    return this.firstParents().get(hash);
  }

  /**
   * The fold's commits as a graph. With every commit's parents, a branch graph (`branchGraph`):
   * the newest fold merge on the backing branch's lane pulling in a lane per source that owns
   * commits; sources without commits get a compact header above it. Without parents, a plain list
   * in one lane (`guessedGraph`), every source in the compact headers, and a note.
   */
  protected readonly graph = computed(() => {
    const request = this.row();
    const answered = this.commitsAnswer();
    const commits = (answered?.commits ?? []).filter((commit) => !!commit.hash);
    const entry = (commit: (typeof commits)[number], label?: string): GraphEntry => ({
      hash: commit.hash ?? '',
      shortHash: commit.shortHash ?? '',
      subject: (commit.message ?? '').split('\n', 1)[0],
      author: commit.author ?? '',
      when: this.ago(commit.date),
      title: this.instant(commit.date),
      label,
    });
    if (request && hasParents(commits)) {
      const sources = answered?.sources ?? [];
      const graph = branchGraph({
        commits: commits.map((commit) => ({
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
    const browser = this.browser;
    // A link to a check (`#check-…`, from the lightning menu or the list) scrolls to it once the
    // request is drawn.
    const route = inject(ActivatedRoute);
    const fragment = toSignal(route.fragment, { initialValue: null });
    const injector = inject(Injector);
    let scrolled: string | null = null;
    effect(() => {
      const target = fragment();
      if (!browser || !target || !this.row() || scrolled === target) return;
      scrolled = target;
      // The check may be drawn later than the request (the test reports load on their own): look
      // for it for a few seconds.
      afterNextRender(
        () => {
          let tries = 0;
          const look = () => {
            const element = document.getElementById(target);
            if (element) element.scrollIntoView({ block: 'center' });
            else if (++tries < 20) setTimeout(look, 250);
          };
          look();
        },
        { injector },
      );
    });
  }
}

/**
 * The data marks (qits-2141) of what the page computes from the request rather than shows as is:
 * the fields each is derived from. The tabs count the fold's commits and the request's runs; the
 * graph lays out the fold's commits (the section names their read) under the request's sources; the
 * release's links are addressed by its repository, version and released commit.
 */
const MARKS = {
  items: { derived: ['items', 'sources'] },
  badge: { derived: ['state', 'approvalRequired', 'approvalState'] },
  tabs: { derived: ['pipeline', 'automations', 'id'] },
  graph: { derived: ['mergedSha', 'backingBranch', 'sources'] },
  releaseLinks: { derived: ['repoId', 'repoName', 'version', 'releasedSha'] },
  /** An artifact's links (`artifactLinks`): its name and version, addressed by its type. */
  artifactLink: { derived: ['type', 'name', 'version'] },
} as const;
