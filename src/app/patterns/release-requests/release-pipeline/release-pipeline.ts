import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CommitBuild, ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal, formatInstant } from '$core/release-requests/release-request-model';
import {
  drawPipeline,
  terminalLine,
  type GateTone,
  type PhaseTone,
} from '$core/release-requests/release-pipeline';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { ReleaseApproval } from '$patterns/release-requests/release-approval/release-approval';
import { ReleaseAutomations } from '$patterns/release-requests/release-automations/release-automations';
import { ReleaseGates } from '$patterns/release-requests/release-gates/release-gates';

const PHASE_COLOURS: Readonly<Record<PhaseTone, string>> = {
  pending: 'text-charcoal-brown-500',
  running: 'text-ocean-deep-700',
  success: 'text-mint-leaf-800',
  failed: 'text-cinnabar-700',
  unsettled: 'text-sunflower-gold-800',
};

const GATE_COLOURS: Readonly<Record<GateTone, string>> = {
  waiting: 'text-sunflower-gold-800',
  passed: 'text-mint-leaf-800',
  failed: 'text-cinnabar-700',
  unknown: 'text-charcoal-brown-600',
};

/**
 * A request's release pipeline as a tree (ported from qits-projects-frontend's
 * `release-pipeline-panel`): the phases QA → Publish → Deployment, each with its state and, unless
 * it succeeded or never ran, a button to run it again; under each phase the gates that follow it,
 * with Approve and Decline under the approval gate while a person must answer, and the
 * automations under theirs; then the line to FINALIZED.
 *
 * A rerun's 409 (the phase already succeeded, is not reached, is running, or the request is done)
 * is said calmly in the phase's row; anything else is a failure. The answered request takes the
 * shown one's place.
 *
 * A request without a pipeline (an older service) gets the plain gates list (`app-release-gates`).
 */
@Component({
  selector: 'app-release-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, ReleaseApproval, ReleaseAutomations, ReleaseGates],
  host: { class: 'block' },
  template: `
    @if (request().pipeline) {
      <section class="rounded-md border border-charcoal-brown-200 bg-white px-3 py-2">
        <header class="mb-1 flex items-baseline gap-2">
          <h2 class="m-0 text-base font-semibold">Release pipeline</h2>
          <span class="font-mono text-xs text-charcoal-brown-500">{{ request().state }}</span>
        </header>

        @for (phase of phases(); track phase.phase) {
          <div class="flex flex-wrap items-center gap-2 font-mono text-sm">
            <span class="text-charcoal-brown-400" aria-hidden="true">{{ phase.glyph }}</span>
            <span class="font-semibold">{{ phase.label }}</span>
            <span [class]="phaseColour(phase.tone)">{{ phase.mark }}</span>
            @if (phase.rerunnable) {
              <ui-action-button [action]="rerunAction(phase.phase, phase.rerunLabel)" />
            }
          </div>
          @if (phase.sentence) {
            <p class="m-0 ml-6 text-sm text-charcoal-brown-700">{{ phase.sentence }}</p>
          }
          @if (refusal()?.phase === phase.phase) {
            <p class="m-0 ml-6 text-sm text-sunflower-gold-900" role="alert">
              {{ refusal()?.message }}
            </p>
          }
          @if (failure()?.phase === phase.phase) {
            <p class="m-0 ml-6 text-sm text-cinnabar-700" role="alert">
              That phase was not run again — {{ failure()?.message }}.
            </p>
          }

          @for (gate of phase.gates; track gate.key) {
            <div class="flex flex-wrap items-baseline gap-2 text-sm">
              <span class="font-mono whitespace-pre text-charcoal-brown-400" aria-hidden="true"
                >{{ phase.trunk }} ⟂</span
              >
              <span class="font-semibold" [class]="gateColour(gate.tone)">{{ gate.name }}</span>
              <span class="text-charcoal-brown-700">{{ gate.sentence }}</span>
            </div>
            @if (gate.detail) {
              <p class="m-0 ml-8 text-sm break-words text-charcoal-brown-600">{{ gate.detail }}</p>
            }
            @if (gate.automations) {
              <app-release-automations class="my-1 ml-8" [request]="request()" />
            }
            @if (gate.asks) {
              <app-release-approval class="my-1 ml-8" [request]="request()" />
            }
          }
        }

        <p
          class="m-0 flex flex-wrap items-baseline gap-2 text-sm"
          [title]="instant(request().mergedToMainAt)"
        >
          <span class="font-mono text-charcoal-brown-400" aria-hidden="true">→</span>
          <span class="font-semibold">{{ terminal().name }}</span>
          <span class="text-charcoal-brown-700">{{ terminal().sentence }}</span>
        </p>
      </section>
    } @else {
      <app-release-gates [request]="request()" [builds]="builds()" />
    }
  `,
})
export class ReleasePipeline {
  private readonly store = inject(ReleaseRequestStore);

  readonly request = input.required<ReleaseRequest>();

  /** The CI verdicts on the fold, for the plain gates list. */
  readonly builds = input.required<readonly CommitBuild[]>();

  protected readonly instant = formatInstant;
  protected readonly phases = computed(() => drawPipeline(this.request()));
  protected readonly terminal = computed(() => terminalLine(this.request()));

  /** The phase being run again. */
  private readonly rerunning = signal<string | null>(null);

  /** A rerun the service would not do (409), in its words, by phase. */
  protected readonly refusal = signal<{ readonly phase: string; readonly message: string } | null>(
    null,
  );

  /** A rerun that failed otherwise. */
  protected readonly failure = signal<{ readonly phase: string; readonly message: string } | null>(
    null,
  );

  protected phaseColour(tone: PhaseTone): string {
    return PHASE_COLOURS[tone];
  }

  protected gateColour(tone: GateTone): string {
    return GATE_COLOURS[tone];
  }

  protected rerunAction(phase: string, label: string): Action {
    return {
      label: `⟳ ${label}`,
      variant: 'muted',
      disabled: this.rerunning() !== null,
      callback: () => void this.rerun(phase),
    };
  }

  private async rerun(phase: string): Promise<void> {
    if (this.rerunning() !== null) return;
    this.refusal.set(null);
    this.failure.set(null);
    this.rerunning.set(phase);
    const request = this.request();
    const outcome = await this.store.rerunPhase(request.repoId ?? '', request.id ?? '', phase);
    this.rerunning.set(null);
    if (outcome.request) return;
    if (outcome.status === 409) {
      this.refusal.set({
        phase,
        message:
          outcome.message ??
          'The service would not run that phase again. Nothing changed; the page may have gone ' +
            'stale under you.',
      });
    } else {
      this.failure.set({ phase, message: describeRefusal(outcome.status, outcome.message) });
    }
  }
}
