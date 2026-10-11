import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { CiRun } from '$core/ci/ci-runs.consumes';
import { PlatformOrigins } from '$core/platform/platform-origins';
import type { CommitBuild, ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { requestRuns } from '$core/release-requests/release-runs';
import type { ChipTone } from '$ui/components/chip/chip';
import { Chip } from '$ui/components/chip/chip';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

const STATUS_TONES: Readonly<Record<string, ChipTone>> = {
  SUCCESS: 'ok',
  QUEUED: 'waiting',
  RUNNING: 'waiting',
  FAILED: 'failed',
  CONFIG_ERROR: 'failed',
  TIMED_OUT: 'failed',
};

/**
 * The CI runs of a release request, newest first, each a link to its page in qits-ci
 * (`<ci origin>/runs/<id>`): the runs that name the request (its QA runs, one per fold, and the
 * release run of its tag), its CI verdicts, and its automations' runs (`requestRuns`). Each shows
 * what it was for, its status, branch, commit and when it started. A run only the request names
 * (older than the repository's newest runs, or in another repository) shows its id alone.
 *
 * Below the list, a link to all of the repository's runs in qits-ci.
 */
@Component({
  selector: 'app-release-runs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, Spinner],
  host: { class: 'block' },
  template: `
    <section class="rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
      <h2 class="m-0 mb-1 text-base font-semibold">Builds</h2>
      <ui-spinner [state]="state()" class="min-h-8">
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          @for (entry of entries(); track entry.id) {
            <li class="flex flex-wrap items-baseline gap-2 text-sm">
              <ui-chip
                [class.hidden]="!entry.run?.status"
                [label]="(entry.run?.status ?? '').toLowerCase().replace('_', ' ')"
                [tone]="tone(entry.run)"
              />
              @if (href(entry.id); as link) {
                <a class="text-ocean-deep-700 no-underline hover:underline" [href]="link">{{
                  entry.label
                }}</a>
              } @else {
                <span>{{ entry.label }}</span>
              }
              <span class="font-mono text-xs text-charcoal-brown-500">{{
                entry.run?.branch ?? entry.id
              }}</span>
              @if (entry.run?.commitSha; as sha) {
                <span class="font-mono text-xs text-charcoal-brown-500" [title]="sha">{{
                  short(sha)
                }}</span>
              }
              @if (entry.run?.createdAt; as at) {
                <span class="text-xs text-charcoal-brown-500" [title]="instant(at)">{{
                  ago(at)
                }}</span>
              }
            </li>
          }
        </ul>
        <p
          class="m-0 py-1 text-sm text-charcoal-brown-500"
          [class]="state() === 'loaded' && entries().length === 0 ? 'block' : 'hidden'"
        >
          No build of this request yet.
        </p>
      </ui-spinner>
      @if (repositoryHref(); as link) {
        <p class="mt-2 mb-0 text-sm">
          <a class="text-ocean-deep-700 no-underline hover:underline" [href]="link"
            >All runs of {{ request().repoName }} in CI</a
          >
        </p>
      }
    </section>
  `,
})
export class ReleaseRuns {
  private readonly origins = inject(PlatformOrigins);

  readonly request = input.required<ReleaseRequest>();
  /** The CI verdicts on the fold. */
  readonly builds = input.required<readonly CommitBuild[]>();
  /** The repository's newest runs. */
  readonly runs = input.required<readonly CiRun[]>();
  readonly state = input.required<LoadState>();

  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string) => formatRelativeTime(iso);

  protected readonly entries = computed(() =>
    requestRuns(this.request(), this.builds(), this.runs()),
  );

  protected tone(run: CiRun | undefined): ChipTone {
    return STATUS_TONES[run?.status ?? ''] ?? 'neutral';
  }

  protected href(runId: string): string | undefined {
    const origin = this.origins.page('ci');
    return origin ? `${origin}/runs/${encodeURIComponent(runId)}` : undefined;
  }

  protected readonly repositoryHref = computed(() => {
    const origin = this.origins.page('ci');
    const repoId = this.request().repoId;
    return origin && repoId ? `${origin}/?repo=${encodeURIComponent(repoId)}` : undefined;
  });
}
