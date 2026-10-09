import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import {
  lifecycleSummary,
  releaseLifecycle,
  shieldOf,
  stepAnchor,
  type Step,
  type StepState,
} from '$core/release-requests/release-lifecycle';
import {
  AutomationCog,
  type AutomationCogState,
} from '$ui/components/automation-cog/automation-cog';
import { GateShield } from '$ui/components/gate-shield/gate-shield';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal } from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip, type ChipTone } from '$ui/components/chip/chip';
import { ReleaseApproval } from '$patterns/release-requests/release-approval/release-approval';
import { ReleaseAutomations } from '$patterns/release-requests/release-automations/release-automations';
import { ReleaseConflictPanel } from '$patterns/release-requests/release-conflict/release-conflict';

const TONES: Readonly<Record<StepState, ChipTone>> = {
  passed: 'ok',
  running: 'waiting',
  pending: 'neutral',
  failed: 'failed',
  cancelled: 'failed',
  skipped: 'neutral',
  unknown: 'waiting',
  'not-reported': 'neutral',
};

const RAIL: Readonly<Record<StepState, string>> = {
  passed: 'bg-mint-leaf-600',
  running: 'bg-sunflower-gold-500',
  pending: 'bg-charcoal-brown-300',
  failed: 'bg-cinnabar-600',
  cancelled: 'bg-cinnabar-600',
  skipped: 'bg-charcoal-brown-200',
  unknown: 'bg-sunflower-gold-500',
  'not-reported': 'bg-charcoal-brown-200',
};

/**
 * A release request's whole lifecycle, top to bottom (`releaseLifecycle`): P1 the fold and its
 * automations, P2 the QA run (alongside the automations), P3 the quality gates, P4 publish, P5 the
 * deployment, P6 the deployment's gates, then the tag reaching main. Each stage has its state; the
 * current one is marked and the ones after it are greyed, so the whole way is always in view.
 *
 * Every check is its own row: its label, its state as the backend words it, its detail and
 * sub-checks, and a link to its CI run or deployment. Actions sit on the row they act on: the
 * conflict under the fold, each automation with Re-run and the waiver, "run again" on a phase that
 * can run again, and Approve or Decline on the approval while a person must answer. A check that
 * needs a person is marked and ringed; each row has an id (`stepAnchor`), so a link can open the
 * page at it. P1's header carries the automations' cog, P3's and P6's their gates' shield.
 */
@Component({
  selector: 'app-release-lifecycle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    AutomationCog,
    Chip,
    GateShield,
    ReleaseApproval,
    ReleaseAutomations,
    ReleaseConflictPanel,
  ],
  host: { class: 'block' },
  template: `
    <section class="rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
      <h2 class="m-0 mb-2 text-base font-semibold">Release lifecycle</h2>
      <ol class="m-0 list-none p-0">
        @for (stage of stages(); track stage.key) {
          <li class="relative pb-3 pl-6" [class.opacity-50]="stage.future">
            <span
              class="absolute top-1.5 left-1 size-3 rounded-full ring-2 ring-white"
              [class]="rail(stage.state)"
              aria-hidden="true"
            ></span>
            @if (!$last) {
              <span
                class="absolute top-5 bottom-0 left-[0.6875rem] w-0.5 bg-charcoal-brown-200"
                aria-hidden="true"
              ></span>
            }
            <div
              class="flex flex-wrap items-center gap-2 rounded px-1"
              [class.bg-ocean-deep-50]="stage.current"
            >
              @if (stage.key === 'fold' && cog(); as point) {
                <ui-automation-cog
                  [state]="cogState(point.state)"
                  [count]="point.count ?? ''"
                  [label]="point.title"
                />
              }
              @if (stage.key === 'gates' || stage.key === 'deploy-gates') {
                <ui-gate-shield [state]="shield(stage.steps)" [label]="stage.label" />
              }
              <h3 class="m-0 text-sm font-semibold">{{ stage.label }}</h3>
              <ui-chip [label]="stageWord(stage.state)" [tone]="tone(stage.state)" />
              @if (stage.current) {
                <span class="text-xs font-semibold text-ocean-deep-700">now</span>
              }
            </div>
            @if (stage.note) {
              <p class="m-0 mt-0.5 px-1 text-xs text-charcoal-brown-500">{{ stage.note }}</p>
            }
            <ul class="m-0 mt-1 flex list-none flex-col gap-1 p-0">
              @for (step of stage.steps; track step.key) {
                <li
                  class="scroll-mt-24 rounded border px-2 py-1 text-sm"
                  [class]="
                    step.attention
                      ? 'border-sunflower-gold-400 bg-sunflower-gold-50 ring-1 ring-sunflower-gold-400'
                      : 'border-charcoal-brown-100'
                  "
                  [id]="anchor(step.key)"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    @if (step.attention) {
                      <svg
                        viewBox="0 0 24 24"
                        class="size-4 shrink-0 text-sunflower-gold-800"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        role="img"
                        aria-label="Needs you"
                      >
                        <path d="M12 3 2.5 20h19z" />
                        <path d="M12 10v4M12 17v.01" />
                      </svg>
                    }
                    <span class="font-semibold">{{ step.label }}</span>
                    @if (step.word) {
                      <ui-chip [label]="step.word" [tone]="tone(step.state)" />
                    }
                    @if (runHref(step.runId); as href) {
                      <a class="text-ocean-deep-700 no-underline hover:underline" [href]="href"
                        >the run in CI</a
                      >
                    }
                    @if (deploymentHref(step.deploymentRequestId); as href) {
                      <a class="text-ocean-deep-700 no-underline hover:underline" [href]="href"
                        >the deployment</a
                      >
                    }
                    @if (step.rerunnable && step.phase) {
                      <ui-action-button [action]="rerunAction(step.phase)" />
                    }
                  </div>
                  @if (step.detail) {
                    <p class="m-0 mt-0.5 break-words text-charcoal-brown-700">{{ step.detail }}</p>
                  }
                  @if (step.checks.length) {
                    <ul class="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 pl-3">
                      @for (check of step.checks; track check.name) {
                        <li class="flex flex-wrap items-center gap-2">
                          <span>{{ check.name }}</span>
                          <ui-chip [label]="check.word" [tone]="tone(check.state)" />
                          @if (check.detail) {
                            <span class="text-charcoal-brown-600">{{ check.detail }}</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                  @if (refusal()?.phase === step.phase && step.phase) {
                    <p class="m-0 mt-0.5 text-sunflower-gold-900" role="alert">
                      {{ refusal()?.message }}
                    </p>
                  }
                  @if (step.kind === 'fold') {
                    <app-release-conflict [request]="request()" />
                  }
                  @if (step.kind === 'automations' && (request().automations?.length ?? 0) > 0) {
                    <app-release-automations class="mt-1" [request]="request()" />
                  }
                  @if (step.kind === 'approval' && step.asks) {
                    <app-release-approval class="mt-1" [request]="request()" />
                  }
                </li>
              }
            </ul>
          </li>
        }
      </ol>
    </section>
  `,
})
export class ReleaseLifecycle {
  private readonly store = inject(ReleaseRequestStore);
  private readonly origins = inject(PlatformOrigins);

  readonly request = input.required<ReleaseRequest>();
  /** The project's slug, for the deployment's address. */
  readonly slug = input.required<string>();

  protected readonly stages = computed(() => releaseLifecycle(this.request()));

  /** The automations as the cog in P1's header (as in the lightning menu). */
  protected readonly cog = computed(() =>
    lifecycleSummary(this.request()).find((point) => point.kind === 'cog'),
  );

  protected readonly shield = shieldOf;
  protected readonly anchor = stepAnchor;

  protected cogState(state: StepState): AutomationCogState {
    return state === 'passed' || state === 'failed' || state === 'running' ? state : 'pending';
  }

  protected tone(state: StepState): ChipTone {
    return TONES[state];
  }

  protected rail(state: StepState): string {
    return RAIL[state];
  }

  protected stageWord(state: StepState): string {
    return state === 'not-reported' ? 'not reported' : state;
  }

  protected runHref(runId: string | null): string | undefined {
    const origin = this.origins.page('ci');
    return runId && origin ? `${origin}/runs/${encodeURIComponent(runId)}` : undefined;
  }

  protected deploymentHref(id: string | null | undefined): string | undefined {
    const origin = this.origins.page('deployments');
    return id && origin
      ? `${origin}/${this.slug()}/deployment-requests/${encodeURIComponent(id)}`
      : undefined;
  }

  /** The phase being run again. */
  private readonly rerunning = signal<string | null>(null);

  /** A rerun the service would not do, in its words, by phase. */
  protected readonly refusal = signal<{ readonly phase: string; readonly message: string } | null>(
    null,
  );

  protected rerunAction(phase: string): Action {
    return {
      label: '⟳ Run again',
      variant: 'muted',
      disabled: this.rerunning() !== null,
      callback: () => void this.rerun(phase),
    };
  }

  private async rerun(phase: string): Promise<void> {
    if (this.rerunning() !== null) return;
    this.refusal.set(null);
    this.rerunning.set(phase);
    const request = this.request();
    const outcome = await this.store.rerunPhase(request.repoId ?? '', request.id ?? '', phase);
    this.rerunning.set(null);
    if (outcome.request) return;
    this.refusal.set({
      phase,
      message:
        outcome.status === 409
          ? (outcome.message ??
            'The service would not run that phase again. Nothing changed; the page may have gone stale under you.')
          : `That phase was not run again — ${describeRefusal(outcome.status, outcome.message)}.`,
    });
  }
}

export type { Step };
