import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import type { CommitBuild, ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  approvalOutstanding,
  awaitingApproval,
  formatInstant,
  formatRelativeTime,
  hasReleased,
} from '$core/release-requests/release-request-model';
import {
  approvalDecision,
  automationsName,
  verdictWord,
} from '$core/release-requests/release-pipeline';
import { ReleaseApproval } from '$patterns/release-requests/release-approval/release-approval';
import { ReleaseAutomations } from '$patterns/release-requests/release-automations/release-automations';

/**
 * A request's gates as a plain list, for a request whose answer carries no pipeline (ported from
 * qits-projects-frontend's `release-gates-panel`): the CI verdicts on the fold, the automations,
 * Publish, Deployment, and the approval with Approve and Decline while a person must answer.
 *
 * A gate configuration that could not be read (any gate UNKNOWN) holds the request, and the panel
 * says so instead of drawing gates. An empty gate list means nothing but somebody's release press.
 */
@Component({
  selector: 'app-release-gates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReleaseApproval, ReleaseAutomations],
  host: { class: 'block' },
  template: `
    <section class="rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
      <h2 class="m-0 mb-1 text-base font-semibold">Gates</h2>

      @if (unknown()) {
        <p class="m-0 text-sm text-sunflower-gold-900" role="alert">
          This repository's gate configuration could not be read, so which gates apply is not known.
          The request is held — nothing has refused it — and the service retries on its own.
        </p>
      } @else if (gates()?.length === 0) {
        <p class="m-0 text-sm text-charcoal-brown-600">
          This repository configures no quality gate, so a release waits on nothing but somebody
          pressing release.
        </p>
      }

      <div class="flex flex-col gap-2 text-sm">
        @if (showCi()) {
          <div>
            <span class="font-semibold">CI</span>
            @if (builds().length === 0) {
              <span class="text-charcoal-brown-600">
                No verdict yet — no build of this fold has announced one.</span
              >
            } @else {
              <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
                @for (build of builds(); track build.runId) {
                  <li
                    class="flex flex-wrap items-baseline gap-2"
                    [class]="
                      build.status === 'SUCCESS' ? 'text-mint-leaf-800' : 'text-cinnabar-700'
                    "
                  >
                    <span class="font-semibold">{{ word(build) }}</span>
                    <span class="font-mono">{{ build.branch }}</span>
                    <span
                      class="text-xs text-charcoal-brown-500"
                      [title]="instant(build.finishedAt)"
                      >{{ ago(build.finishedAt) }}</span
                    >
                    @if (runHref(build); as href) {
                      <a class="text-ocean-deep-700 no-underline hover:underline" [href]="href"
                        >the run in CI</a
                      >
                    }
                  </li>
                }
              </ul>
            }
          </div>
        }

        @if (request().automations) {
          <div>
            <span class="font-semibold">{{ automations() }}</span>
            <app-release-automations class="mt-1" [request]="request()" />
          </div>
        }

        @if (publish(); as publish) {
          <div>
            <span class="font-semibold">{{
              publish.state === 'FAILED'
                ? '✗ Publish'
                : publish.state === 'PASSED'
                  ? '✓ Publish'
                  : 'Publish'
            }}</span>
            <span class="text-charcoal-brown-700">
              @if (publish.state === 'FAILED') {
                — the release pipeline of this tag failed. That is the environment rather than a
                refusal: retry the run with <code>qits ci retry</code>, and this request stays open
                until it goes green.
              } @else if (publish.state === 'PASSED') {
                — the release pipeline of this tag is green
              } @else if (released()) {
                — released, waiting on the release pipeline of this tag
              } @else {
                — answered after the tag, never before it
              }
            </span>
          </div>
        }

        @if (deployment(); as deployment) {
          <div>
            <span class="font-semibold">{{
              deployment.state === 'PASSED' ? '✓ Deployment' : 'Deployment'
            }}</span>
            <span class="text-charcoal-brown-700">
              @if (deployment.state === 'PASSED') {
                — live, and main carries this release
              } @else if (released()) {
                — released, waiting on its deployment to go live
              } @else {
                — answered after the tag, never before it
              }
            </span>
          </div>
        }

        @if (request().approvalRequired) {
          <div>
            <span class="font-semibold">{{ approvalName() }}</span>
            @if (outstanding()) {
              <span class="text-charcoal-brown-700"> — waiting for a person</span>
            } @else {
              <span class="text-charcoal-brown-700" [title]="instant(request().approvedAt)">
                — {{ decision() }}</span
              >
            }
            @if (request().approvalNote; as note) {
              <p class="mt-1 mb-0 text-charcoal-brown-700 italic">{{ note }}</p>
            }
            @if (approvalDetail(); as detail) {
              <p class="mt-1 mb-0 text-charcoal-brown-700">{{ detail }}</p>
            }
            @if (askable()) {
              <app-release-approval class="mt-2" [request]="request()" />
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class ReleaseGates {
  private readonly origins = inject(PlatformOrigins);

  readonly request = input.required<ReleaseRequest>();

  /** The CI verdicts on the request's fold, newest first. */
  readonly builds = input.required<readonly CommitBuild[]>();

  protected readonly word = verdictWord;
  protected readonly instant = formatInstant;
  protected readonly ago = (iso: string | undefined) => formatRelativeTime(iso);

  protected readonly gates = computed(() => this.request().gates);

  private gate(kind: string) {
    return this.gates()?.find((gate) => gate.kind === kind) ?? null;
  }

  protected readonly unknown = computed(() =>
    (this.gates() ?? []).some((gate) => gate.state === 'UNKNOWN'),
  );

  /** CI is drawn when it is a gate, or when the answer names no gates at all (an old service). */
  protected readonly showCi = computed(
    () => !this.unknown() && (this.gates() === undefined || this.gate('CI') !== null),
  );

  protected readonly publish = computed(() => (this.unknown() ? null : this.gate('PUBLISH')));
  protected readonly deployment = computed(() => (this.unknown() ? null : this.gate('DEPLOYMENT')));
  protected readonly automations = computed(() =>
    automationsName(this.request().automations ?? []),
  );
  protected readonly released = computed(() => hasReleased(this.request()));
  protected readonly outstanding = computed(() => approvalOutstanding(this.request()));
  protected readonly askable = computed(() => awaitingApproval(this.request()));
  protected readonly decision = computed(() => approvalDecision(this.request()));

  protected readonly approvalName = computed(() => {
    if (this.outstanding()) return 'Approval';
    return this.request().approvalState === 'DECLINED' ? '✗ Approval' : '✓ Approval';
  });

  protected readonly approvalDetail = computed(() => this.gate('APPROVAL')?.detail?.trim() || null);

  protected runHref(build: CommitBuild): string | undefined {
    const origin = this.origins.page('ci');
    return build.runId && origin ? `${origin}/runs/${encodeURIComponent(build.runId)}` : undefined;
  }
}
