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
  gateTone,
  nobodyWatching,
  requestBadge,
  shortSha,
  utcMinute,
} from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { ReleaseWithdraw } from '$patterns/release-requests/release-withdraw/release-withdraw';

/**
 * The open project's release requests, at `/projects/<slug>/release-requests`: everything still
 * open across its repositories, then the last few finalized, as qits-projects answers them (open
 * ones first, each part most recently changed first). A request is open until its release is
 * finalized, so a released row is still in flight.
 *
 * Each row shows the request's state (or "awaiting approval"), its priority, "nobody watching"
 * for a stopped request a machine asked for, the repository, the summary, when it last changed, its
 * version, its merged commit, who asked, the service's detail, and its gates. The repository and
 * summary link to the request's own page, `release-requests/<id>`. A request that can still be
 * called off has Withdraw.
 *
 * The requests come from `ProjectsStore`, the same answer the top bar's release menu and the
 * sidebar entry read; domain events refresh it there.
 */
@Component({
  selector: 'app-release-requests-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, PageLayoutComponent, ReleaseWithdraw, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Release Requests">
        <p class="mt-0 mb-4 text-sm text-gray-600">
          The open requests plus the last finalized ones, across all of this project’s repositories.
          A request stays open until its release is finalized.
        </p>
        <ui-spinner [state]="state()" class="min-h-48">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (request of requests(); track request.id) {
              @let badge = badgeOf(request);
              <li class="rounded-md border border-gray-200 bg-white px-3 py-2">
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
                  <a
                    class="font-semibold break-all text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="request.id ?? ''"
                    >{{ request.repoName }}</a
                  >
                  <a
                    class="min-w-48 flex-1 break-words text-gray-900 no-underline hover:underline"
                    [routerLink]="request.id ?? ''"
                    >{{ request.summary }}</a
                  >
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
                  <span class="flex flex-wrap gap-1">
                    @for (gate of request.gates ?? []; track gate.kind) {
                      <ui-chip
                        [label]="gate.kind + ' · ' + gate.state"
                        [tone]="gateTone(gate.state)"
                      />
                    }
                  </span>
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
  protected readonly gateTone = gateTone;
  protected readonly badgeOf = requestBadge;
  protected readonly when = utcMinute;
  protected readonly sha = shortSha;

  private readonly answer = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.releaseRequests()[id] : undefined;
  });

  protected readonly requests = computed(() => this.answer()?.requests ?? []);

  protected readonly state = computed((): LoadState => {
    const status = this.answer()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

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
