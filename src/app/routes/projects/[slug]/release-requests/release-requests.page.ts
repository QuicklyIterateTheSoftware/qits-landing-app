import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ReleaseRequestEntry } from '$core/projects/projects.consumes';
import { ProjectsStore } from '$core/projects/projects.store';
import {
  FROZEN_TITLE,
  freezeChip,
  freezeCount,
  nobodyWatching,
  queuedBehind,
  releaseRequestRef,
  requestBadge,
  shortSha,
  utcMinute,
} from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip, chipClass } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { LifecycleLine } from '$ui/components/lifecycle-line/lifecycle-line';
import { attentionOf, lifecycleSummary } from '$core/release-requests/release-lifecycle';
import { ReleaseWithdraw } from '$patterns/release-requests/release-withdraw/release-withdraw';

/**
 * The open project's release requests, at `/projects/<slug>/release-requests`: everything still
 * open across its repositories, then the last few finalized, as qits-projects answers them (open
 * ones first, each part most recently changed first). A request is open until its release is
 * finalized, so a released row is still in flight.
 *
 * Each row shows the request's state (or "awaiting approval"), its priority, "nobody watching"
 * for a stopped request a machine asked for, its logical id (`<repository>-rr-<n>`; the repository
 * where an older answer has none), the summary, when it last changed, its
 * version, its merged commit, who asked, the service's detail, and its lifecycle as a line (cog,
 * phase chips, gate shields). The soft feature freeze (epic qits-1580): a frozen request has a
 * `frozen 3/3` chip, a queued one `queued behind <id>` (a link to that request), and an open one
 * that is neither a quiet count of its counted branches (`1/3`). A request that needs a person is
 * ringed, with a link to that check. The logical id
 * and summary link to the request's own page, `release-requests/<logical id>` (its uuid where it
 * has no logical id). A request that can still be
 * called off has Withdraw.
 *
 * The requests come from `ProjectsStore`, the same answer the top bar's release menu and the
 * sidebar entry read; domain events refresh it there. A read that fails says so, with Retry.
 *
 * Staleness (qits-1270): `RELEASE_REQUEST_EVENTS` about the open project → its release requests
 * (`ProjectsStore.refreshReleaseRequests`), through the release menu's subscription (`ReleaseMenu`,
 * in the shell above this page, so it lives at least as long as the page). The page subscribes no
 * second time: the same answer read twice per burst would only double the call. A refresh keeps
 * the rows on show (no spinner).
 */
@Component({
  selector: 'app-release-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    LifecycleLine,
    LoadFailure,
    PageLayoutComponent,
    ReleaseWithdraw,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Release Requests">
        <p class="mt-0 mb-4 text-sm text-gray-600">
          The open requests plus the last finalized ones, across all of this project’s repositories.
          A request stays open until its release is finalized.
        </p>
        <ui-load-failure
          message="This project’s release requests could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (request of requests(); track request.id) {
              @let badge = badgeOf(request);
              @let needs = attention(request);
              <li
                class="rounded-md border px-3 py-2"
                [class]="
                  needs.length
                    ? 'border-sunflower-gold-400 bg-sunflower-gold-50 ring-1 ring-sunflower-gold-400'
                    : 'border-gray-200 bg-white'
                "
              >
                <div class="flex flex-wrap items-baseline gap-2">
                  <ui-chip [label]="badge.label" [tone]="badge.tone" />
                  <ui-chip
                    [class.hidden]="!request.priority"
                    [label]="(request.priority ?? '').toLowerCase()"
                    title="The highest priority among this request’s branches"
                  />
                  <ui-chip
                    [class.hidden]="watched(request)"
                    label="nobody watching"
                    tone="waiting"
                    title="A machine asked for this release and it has stopped: it moves again only when somebody pushes a fix"
                  />
                  @if (frozen(request); as chip) {
                    <ui-chip [label]="chip.label" [tone]="chip.tone" [title]="frozenTitle" />
                  }
                  @if (behind(request); as ahead) {
                    <a
                      class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold whitespace-nowrap no-underline hover:underline"
                      [class]="queuedTone"
                      [routerLink]="ahead"
                      title="Held back by the feature freeze: this request folds and gates nothing until the one ahead of it has released or been withdrawn"
                      >queued behind {{ ahead }}</a
                    >
                  }
                  <a
                    class="font-semibold break-all text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="ref(request)"
                    >{{ request.qualifiedId ?? request.repoName }}</a
                  >
                  <a
                    class="min-w-48 flex-1 break-words text-gray-900 no-underline hover:underline"
                    [routerLink]="ref(request)"
                    >{{ request.summary }}</a
                  >
                  @if (count(request); as counted) {
                    <span
                      class="text-xs whitespace-nowrap text-gray-400"
                      title="Counted branches of the feature freeze's threshold: at the threshold, new asks queue behind this request"
                      >{{ counted }}</span
                    >
                  }
                  <span class="text-xs whitespace-nowrap text-gray-500">{{
                    when(request.updatedAt)
                  }}</span>
                </div>
                <div
                  class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-gray-500"
                >
                  <span [class]="request.version ? 'inline' : 'hidden'"
                    >version <span class="font-mono">{{ request.version }}</span></span
                  >
                  <span
                    >merged <span class="font-mono">{{ sha(request.mergedSha) || '–' }}</span></span
                  >
                  <span>{{ request.requester || '–' }}</span>
                  <ui-lifecycle-line [points]="summary(request)" />
                  @if (needs[0]; as first) {
                    <a
                      class="inline-flex items-center gap-1 font-semibold text-sunflower-gold-900 no-underline hover:underline"
                      [routerLink]="ref(request)"
                      [fragment]="first.anchor"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        class="size-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 3 2.5 20h19z" />
                        <path d="M12 10v4M12 17v.01" />
                      </svg>
                      {{ first.action }} · {{ first.label }}
                    </a>
                  }
                  <app-release-withdraw class="ml-auto" [request]="request" />
                </div>
                <p
                  class="mt-1 mb-0 text-sm break-words text-gray-700"
                  [class]="request.detail ? 'block' : 'hidden'"
                >
                  {{ request.detail }}
                </p>
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-gray-500"
            [class]="state() === 'loaded' && requests().length === 0 ? 'block' : 'hidden'"
          >
            Nothing is open in this project, and no release has been finalized recently.
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ReleaseRequestsPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(ProjectsStore);
  protected readonly summary = lifecycleSummary;
  protected readonly attention = attentionOf;
  protected readonly badgeOf = requestBadge;
  protected readonly when = utcMinute;
  protected readonly sha = shortSha;
  protected readonly ref = releaseRequestRef;
  protected readonly frozen = freezeChip;
  protected readonly frozenTitle = FROZEN_TITLE;
  protected readonly count = freezeCount;
  protected readonly behind = queuedBehind;
  protected readonly queuedTone = chipClass('waiting');

  private readonly answer = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.releaseRequests()[id] : undefined;
  });

  protected readonly requests = computed(() => this.answer()?.requests ?? []);

  protected readonly state = computed((): LoadState => {
    const status = this.answer()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  /** Reads the list again after a failed read. */
  protected retry(): void {
    const id = this.selected.project()?.id;
    if (id) void this.store.loadReleaseRequests(id);
  }

  protected watched(request: ReleaseRequestEntry): boolean {
    return !nobodyWatching(request);
  }

  constructor() {
    // In the browser only (the server render has no session cookie). The store fetches once per
    // project; the release menu asks too, and whichever asks first makes the call.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.store.loadReleaseRequests(id));
    });
  }
}
