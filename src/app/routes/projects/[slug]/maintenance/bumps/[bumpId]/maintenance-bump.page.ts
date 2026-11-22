import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsResource,
} from '@qits/angular';
import { durationBetween, elapsedSince } from '$core/ci/ci-run';
import { CiRunLinks } from '$core/ci/ci-run-links';
import { BUMP_EVENTS } from '$core/maintenance/bump-events';
import {
  bumpStatusLabel,
  bumpStatusTone,
  isUnderWay,
  releaseRequestRef,
  type ReleaseRequestRef,
} from '$core/maintenance/bump-model';
import type { BumpDetail } from '$core/maintenance/maintenance.consumes';
import { MAINTENANCE_BUMP } from '$core/maintenance/maintenance.operations';
import { MaintenanceRepositoryLinks } from '$core/maintenance/repository-links';
import { SelectedProject } from '$core/projects/selected-project';
import {
  formatInstant,
  formatRelativeTime,
  shortShaOrNone,
} from '$core/release-requests/release-request-model';
import { isMissing } from '$core/resources/resource-family';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

// Moved to `$core/maintenance/bump-model` (qits-2334, shared with the repository page).
export { bumpStatusLabel, bumpStatusTone, isUnderWay, releaseRequestRef, type ReleaseRequestRef };

/** The release states that say the bump's release is not coming: the request will never land. */
const RELEASE_NOT_COMING: ReadonlySet<string> = new Set(['REJECTED', 'FAILED', 'CONFLICTED']);

/**
 * Whether the release a bump asked for is not coming: only a request REJECTED, FAILED or
 * CONFLICTED. REQUESTED (every automation bump that succeeded: its request is still PENDING), any
 * other state and none are not flagged.
 */
export function releaseNotComing(state: string | null | undefined): boolean {
  return !!state && RELEASE_NOT_COMING.has(state);
}

/** The bump's CI runs: every id in `ciRunIds`, else the comma-joined `ciRunId`'s; none if neither. */
export function bumpRunIds(bump: Pick<BumpDetail, 'ciRunIds' | 'ciRunId'>): readonly string[] {
  const ids = bump.ciRunIds ?? [];
  if (ids.length) return ids;
  return (bump.ciRunId ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * How long the bump took, from its start to its finish; while it is under way, how long it has
 * run so far (`running for …`); none when it never started or settled without a finish.
 */
export function bumpDuration(
  bump: Pick<BumpDetail, 'status' | 'startedAt' | 'finishedAt'>,
  nowMs = Date.now(),
): string | undefined {
  if (!bump.startedAt) return undefined;
  if (bump.finishedAt) return durationBetween(bump.startedAt, bump.finishedAt);
  if (!isUnderWay(bump.status)) return undefined;
  const elapsed = elapsedSince(bump.startedAt, nowMs);
  return elapsed ? `running for ${elapsed}` : undefined;
}

/** Whether the read was refused for the viewer's roles. */
function refused(read: { status(): string; error(): unknown }): boolean {
  if (read.status() !== 'error') return false;
  const error = read.error();
  return error instanceof QitsApiError && error.status === 403;
}

/**
 * One version bump, at `/projects/<slug>/maintenance/bumps/<bumpId>` (qits-2332; replaces
 * qits-maintenance-frontend's `bumps/:id`), the path mirroring `GET /maintenance/api/bumps/{id}`.
 * A detail page of the Maintenance section: no sidebar entry of its own. Reached from the top
 * bar's bumps menu and the repository page's recent bumps (qits-2334).
 *
 * Reads only the bump (`MAINTENANCE_BUMP`, `getBump`), in the browser only (the server has no
 * session), through `qitsResource`; no project filter, the id is the whole address.
 *
 * - Heading: the bump's group (its automation kind) and repository (linked to its maintenance
 *   page, `open-maintenance-repository`, qits-2334), its status as a chip (any status, SUPERSEDED
 *   or one the page does not know, as its word).
 * - Facts: repository, group, mode, trigger, branch, started, finished with the duration (or how
 *   long it has run while under way), the result commit (short) and the pipeline's config path.
 * - Release: the release request, linked to its page when it is a request id; the sentinels
 *   `converged` and `refused` as words with what they mean; none when null. The release state and
 *   qits-projects' detail as they arrive, as of `releaseStateAt`; only REJECTED, FAILED or
 *   CONFLICTED say the release is not coming.
 * - CI runs: one link per run (`ciRunIds`, else `ciRunId`) to its page here (`CiRunLinks`), with
 *   the runs' status.
 * - The message as plain text; only a FAILED bump's is an alert. A failed run's `failure`: the
 *   step, its image and exit code and the log excerpt as it is.
 * - Changes: ecosystem, manifest, dependency, from, to, location; none is "This bump sent no
 *   changes." with the message.
 *
 * States: loading; a 404 is "No bump <id>."; a 403 a refusal (only qits:admin, admin-agent,
 * desk-admin, desk, system and agent may read it); any other failure offers Retry. Marks
 * (qits-2141): the bump is an entity by its `id`, each value its field or the fields it is
 * derived from, each change an entity by its dependency's `name`.
 *
 * Staleness (qits-1270): `BUMP_EVENTS` → the bump, debounced, only while it is REQUESTED or
 * RUNNING (its run ends, its release request moves); a settled bump never changes. Refresh reads
 * it again.
 */
@Component({
  selector: 'app-maintenance-bump-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, QitsEntity, QitsExit, QitsField, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Bump" [actions]="actions">
        <p
          class="m-0 mb-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          role="alert"
          [class.hidden]="!refusal()"
        >
          Reading a bump needs a staff role: qits:admin, qits:desk or qits:agent.
        </p>
        <ui-load-failure
          message="This bump could not be read."
          [class.hidden]="state() !== 'error' || refusal()"
          (retry)="read.reload()"
        />
        @if (missing()) {
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" data-missing>
            No bump {{ bumpId() }}.
          </p>
        }
        <ui-spinner
          [state]="state()"
          class="min-h-48"
          [class.hidden]="state() === 'error' || missing()"
        >
          @if (shown(); as bump) {
            <article [qitsEntity]="bump" entityKey="id" data-bump>
              <header class="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 class="m-0 text-lg font-semibold break-all text-fg">
                  <span [fieldOf]="bump" qitsField="group">{{ bump.group }}</span>
                  <span class="text-fg-muted"> · </span>
                  <a
                    class="text-accent no-underline hover:underline"
                    [qitsExit]="repositoryLinks.opening.repository"
                    [exitParams]="repositoryLinks.params(bump.repository)"
                    [fieldOf]="bump"
                    qitsField="repository"
                    >{{ bump.repository }}</a
                  >
                </h2>
                <ui-chip
                  [label]="statusLabel(bump.status)"
                  [tone]="statusTone(bump.status)"
                  [fieldOf]="bump"
                  [qitsField]="marks.status"
                  data-status
                />
              </header>

              @if (bump.message && bump.status === 'FAILED') {
                <p
                  class="mt-0 mb-4 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm wrap-anywhere text-fg"
                  role="alert"
                  [fieldOf]="bump"
                  qitsField="message"
                  data-message
                >
                  {{ bump.message }}
                </p>
              } @else if (bump.message && (bump.changes ?? []).length) {
                <p
                  class="mt-0 mb-4 text-sm wrap-anywhere text-fg-soft"
                  [fieldOf]="bump"
                  qitsField="message"
                  data-message
                >
                  {{ bump.message }}
                </p>
              }

              <dl
                class="mt-0 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                aria-label="Facts"
                data-facts
              >
                <dt class="text-fg-muted">Repository</dt>
                <dd class="m-0 wrap-anywhere">
                  <a
                    class="text-accent no-underline hover:underline"
                    [qitsExit]="repositoryLinks.opening.repository"
                    [exitParams]="repositoryLinks.params(bump.repository)"
                    [fieldOf]="bump"
                    qitsField="repository"
                    >{{ bump.repository }}</a
                  >
                </dd>
                <dt class="text-fg-muted">Group</dt>
                <dd class="m-0 wrap-anywhere" [fieldOf]="bump" qitsField="group">
                  {{ bump.group }}
                </dd>
                <dt class="text-fg-muted">Mode</dt>
                <dd class="m-0" [fieldOf]="bump" qitsField="mode">{{ bump.mode }}</dd>
                <dt class="text-fg-muted">Trigger</dt>
                <dd class="m-0" [fieldOf]="bump" qitsField="trigger">{{ bump.trigger }}</dd>
                <dt class="text-fg-muted">Branch</dt>
                <dd class="m-0 font-mono text-xs wrap-anywhere" [fieldOf]="bump" qitsField="branch">
                  {{ bump.branch }}
                </dd>
                <dt class="text-fg-muted">Started</dt>
                <dd
                  class="m-0"
                  [title]="instant(bump.startedAt)"
                  [fieldOf]="bump"
                  [qitsField]="marks.startedAt"
                >
                  {{ ago(bump.startedAt) }}
                </dd>
                <dt class="text-fg-muted">Finished</dt>
                <dd class="m-0" [fieldOf]="bump" [qitsField]="marks.finished" data-finished>
                  <span [title]="instant(bump.finishedAt)">{{ ago(bump.finishedAt) }}</span>
                  @if (duration(bump); as duration) {
                    <span class="text-fg-soft"> · {{ duration }}</span>
                  }
                </dd>
                <dt class="text-fg-muted">Result</dt>
                <dd
                  class="m-0 font-mono text-xs"
                  [title]="bump.resultSha ?? ''"
                  [fieldOf]="bump"
                  [qitsField]="marks.resultSha"
                >
                  {{ short(bump.resultSha) }}
                </dd>
                <dt class="text-fg-muted">Config</dt>
                <dd
                  class="m-0 font-mono text-xs wrap-anywhere"
                  [fieldOf]="bump"
                  qitsField="configPath"
                >
                  {{ bump.configPath ?? '–' }}
                </dd>
              </dl>

              <section aria-labelledby="bump-release" class="mb-6">
                <h3 id="bump-release" class="mt-0 mb-2 text-base font-semibold">Release</h3>
                <dl
                  class="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                  aria-label="Release"
                >
                  <dt class="text-fg-muted">Request</dt>
                  <dd
                    class="m-0 wrap-anywhere"
                    [fieldOf]="bump"
                    [qitsField]="marks.releaseRequest"
                    data-release-request
                  >
                    @let ref = requestOf(bump.releaseRequestId);
                    @switch (ref.kind) {
                      @case ('request') {
                        <a
                          class="font-mono text-xs text-accent no-underline hover:underline"
                          [qitsExit]="requesting.request"
                          [exitParams]="{ slug: slug(), requestId: requestId(ref) }"
                          >{{ requestId(ref) }}</a
                        >
                      }
                      @case ('sentinel') {
                        <span class="font-semibold">{{ sentinelWord(ref) }}</span>
                        @if (sentinelExplanation(ref); as explanation) {
                          <span class="text-fg-soft">: {{ explanation }}</span>
                        }
                      }
                      @default {
                        none
                      }
                    }
                  </dd>
                  <dt class="text-fg-muted">State</dt>
                  <dd
                    class="m-0 wrap-anywhere"
                    [fieldOf]="bump"
                    [qitsField]="marks.releaseState"
                    data-release-state
                  >
                    @if (bump.releaseState) {
                      <span class="font-semibold">{{ bump.releaseState }}</span>
                      @if (bump.releaseStateAt) {
                        <span class="text-fg-muted" [title]="instant(bump.releaseStateAt)">
                          · as of {{ ago(bump.releaseStateAt) }}</span
                        >
                      }
                      @if (bump.releaseDetail) {
                        <span class="block text-fg-soft">{{ bump.releaseDetail }}</span>
                      }
                      @if (notComing(bump.releaseState)) {
                        <span class="mt-1 block font-semibold text-danger" data-not-coming>
                          This release is not coming: the request will not land.
                        </span>
                      }
                    } @else {
                      none
                    }
                  </dd>
                </dl>
              </section>

              <section aria-labelledby="bump-runs" class="mb-6">
                <h3 id="bump-runs" class="mt-0 mb-2 text-base font-semibold">CI runs</h3>
                <p
                  class="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                  [fieldOf]="bump"
                  [qitsField]="marks.runs"
                  data-runs
                >
                  @for (runId of runIds(bump); track runId) {
                    <a
                      class="font-mono text-xs text-accent no-underline hover:underline"
                      [qitsExit]="runs.opening.run"
                      [exitParams]="runs.params(runId)"
                      >{{ runId }}</a
                    >
                  } @empty {
                    <span class="text-fg-muted">No CI run.</span>
                  }
                  @if (bump.ciRunStatus) {
                    <span class="text-fg-soft" data-run-status>{{ bump.ciRunStatus }}</span>
                  }
                </p>
              </section>

              @if (bump.failure; as failure) {
                <section aria-labelledby="bump-failure" class="mb-6" data-failure>
                  <h3 id="bump-failure" class="mt-0 mb-2 text-base font-semibold">Failure</h3>
                  <dl
                    class="mt-0 mb-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm"
                    aria-label="Failure"
                  >
                    <dt class="text-fg-muted">Step</dt>
                    <dd class="m-0" [fieldOf]="bump" qitsField="failure.stepIndex">
                      {{ failure.stepIndex }}
                    </dd>
                    <dt class="text-fg-muted">Image</dt>
                    <dd
                      class="m-0 font-mono text-xs wrap-anywhere"
                      [fieldOf]="bump"
                      qitsField="failure.image"
                    >
                      {{ failure.image }}
                    </dd>
                    <dt class="text-fg-muted">Exit code</dt>
                    <dd class="m-0" [fieldOf]="bump" qitsField="failure.exitCode">
                      {{ failure.exitCode }}
                    </dd>
                  </dl>
                  <pre
                    class="m-0 max-h-[32rem] overflow-auto rounded bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap text-fg"
                    [fieldOf]="bump"
                    qitsField="failure.excerpt"
                    data-excerpt
                    >{{ failure.excerpt }}</pre>
                </section>
              }

              <section aria-labelledby="bump-changes">
                <h3 id="bump-changes" class="mt-0 mb-2 text-base font-semibold">Changes</h3>
                @if ((bump.changes ?? []).length) {
                  <div class="overflow-x-auto rounded-md border border-line">
                    <table class="w-full border-collapse text-left text-sm" aria-label="Changes">
                      <thead class="bg-surface-muted text-xs text-fg-muted">
                        <tr>
                          <th class="px-3 py-1.5 font-semibold">Ecosystem</th>
                          <th class="px-3 py-1.5 font-semibold">Manifest</th>
                          <th class="px-3 py-1.5 font-semibold">Dependency</th>
                          <th class="px-3 py-1.5 font-semibold">From</th>
                          <th class="px-3 py-1.5 font-semibold">To</th>
                          <th class="px-3 py-1.5 font-semibold">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (change of bump.changes; track $index) {
                          <tr
                            class="border-t border-line-subtle"
                            [qitsEntity]="change"
                            entityKey="name"
                          >
                            <td class="px-3 py-1.5" [fieldOf]="change" qitsField="ecosystem">
                              {{ change.ecosystem }}
                            </td>
                            <td
                              class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                              [fieldOf]="change"
                              qitsField="manifestPath"
                            >
                              {{ change.manifestPath }}
                            </td>
                            <td
                              class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                              [fieldOf]="change"
                              qitsField="name"
                            >
                              {{ change.name }}
                            </td>
                            <td
                              class="px-3 py-1.5 font-mono text-xs"
                              [fieldOf]="change"
                              qitsField="from"
                            >
                              {{ change.from }}
                            </td>
                            <td
                              class="px-3 py-1.5 font-mono text-xs"
                              [fieldOf]="change"
                              qitsField="to"
                            >
                              {{ change.to }}
                            </td>
                            <td
                              class="px-3 py-1.5 font-mono text-xs wrap-anywhere"
                              [fieldOf]="change"
                              qitsField="location"
                            >
                              {{ change.location ?? '–' }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <div
                    class="text-sm"
                    [fieldOf]="bump"
                    [qitsField]="marks.noChanges"
                    data-no-changes
                  >
                    <p class="m-0 text-fg-muted">This bump sent no changes.</p>
                    @if (bump.message && bump.status !== 'FAILED') {
                      <p class="mt-1 mb-0 wrap-anywhere text-fg-soft" data-message>
                        {{ bump.message }}
                      </p>
                    }
                  </div>
                }
              </section>
            </article>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MaintenanceBumpPage {
  private readonly selected = inject(SelectedProject);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly runs = inject(CiRunLinks);
  /** The bump's repository links its maintenance page (qits-2334). */
  protected readonly repositoryLinks = inject(MaintenanceRepositoryLinks);

  /** The release request the bump belongs to. */
  protected readonly requesting = outcomes('open-bump-release-request', {
    request: exit('projects/:slug/releases/requests/:requestId'),
  });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The bump the address names. */
  protected readonly bumpId = computed(() => this.params().get('bumpId') ?? '');
  protected readonly slug = computed(() => this.selected.slug() ?? '');

  /** The bump, read again after `BUMP_EVENTS` while it is under way. */
  protected readonly read = qitsResource(
    MAINTENANCE_BUMP,
    () => {
      const id = this.bumpId();
      return this.browser && id ? { path: { id } } : undefined;
    },
    { refreshOn: { names: BUMP_EVENTS, when: () => isUnderWay(this.shown()?.status) } },
  );

  /** The bump as the page shows it: read, and the one the address names. */
  protected readonly shown = computed((): BumpDetail | undefined => {
    const bump = this.read.hasValue() ? this.read.value() : undefined;
    return bump && bump.id === this.bumpId() ? bump : undefined;
  });

  /** No such bump: a 404. */
  protected readonly missing = computed(() => isMissing(this.read));

  /** Whether the read was refused for the viewer's roles. */
  protected readonly refusal = computed(() => refused(this.read));

  /** Failed when the read failed (but for a 404, which is {@link missing}); loaded once read. */
  protected readonly state = computed((): LoadState => {
    return this.missing() ? 'loading' : loadState(this.read);
  });

  /** Refresh: reads the bump again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.read.reload() },
  ];

  protected readonly marks = MARKS;
  protected readonly statusLabel = bumpStatusLabel;
  protected readonly statusTone = bumpStatusTone;
  protected readonly notComing = releaseNotComing;
  protected readonly requestOf = releaseRequestRef;
  protected readonly runIds = bumpRunIds;
  protected readonly short = shortShaOrNone;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | null | undefined) => formatRelativeTime(iso);
  protected readonly duration = (bump: BumpDetail) => bumpDuration(bump);

  protected requestId(ref: ReleaseRequestRef): string {
    return ref.kind === 'request' ? ref.id : '';
  }

  protected sentinelWord(ref: ReleaseRequestRef): string {
    return ref.kind === 'sentinel' ? ref.word : '';
  }

  protected sentinelExplanation(ref: ReleaseRequestRef): string {
    return ref.kind === 'sentinel' ? ref.explanation : '';
  }
}

/** The data marks of what the page derives from the bump (each a class constant, as the rule reads). */
const MARKS = {
  status: { derived: ['status'] },
  startedAt: { derived: ['startedAt'] },
  finished: { derived: ['finishedAt', 'startedAt', 'status'] },
  resultSha: { derived: ['resultSha'] },
  releaseRequest: { derived: ['releaseRequestId'] },
  releaseState: { derived: ['releaseState', 'releaseDetail', 'releaseStateAt'] },
  runs: { derived: ['ciRunIds', 'ciRunId', 'ciRunStatus'] },
  noChanges: { derived: ['changes', 'message'] },
} as const;
