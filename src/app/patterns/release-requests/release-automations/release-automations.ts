import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { PlatformOrigins } from '$core/platform/platform-origins';
import type {
  ReleaseAutomation,
  ReleaseRequest,
} from '$core/release-requests/release-request.consumes';
import { describeRefusal, shortShaOrNone } from '$core/release-requests/release-request-model';
import {
  automationRerunnable,
  automationSentence,
  failureLine,
  movedFold,
} from '$core/release-requests/release-pipeline';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A request's automations (qits-978), ported from qits-projects-frontend's `release-automations`:
 * each row's label, state and detail, a link to its CI run, Re-run for a failed, unknown or fresh
 * one, and for a failed one the step it stopped at with the log's excerpt.
 *
 * An automation that does not apply to this repository (`NOT_APPLICABLE`) is greyed, with the
 * service's reason.
 *
 * Below the rows, "Waive for this fold" asks for a reason and waives the automations gate for the
 * fold on show (`qits:admin` only). A 403 hides it for the rest of the visit. A 409 that names
 * another fold says the fold moved.
 *
 * Re-run answers 202 and no request: the row moves on the next refresh (a domain event). A 409 is
 * "one is already running".
 */
@Component({
  selector: 'app-release-automations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    @if (rows().length === 0) {
      <span class="text-sm text-charcoal-brown-600">— nothing applies to this repository</span>
    } @else {
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        @for (row of rows(); track row.kind) {
          <li
            class="rounded border px-2 py-1 text-sm"
            [class]="
              row.state === 'FAILED'
                ? 'border-cinnabar-200 bg-cinnabar-50'
                : row.state === 'NOT_APPLICABLE'
                  ? 'border-dashed border-charcoal-brown-200 bg-white text-charcoal-brown-400'
                  : 'border-charcoal-brown-200 bg-white'
            "
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-semibold">{{ row.label }}</span>
              <span class="text-charcoal-brown-700">{{ sentence(row) }}</span>
              @if (runHref(row); as href) {
                <a class="text-ocean-deep-700 no-underline hover:underline" [href]="href"
                  >the run in CI</a
                >
              }
              @if (rerunnable(row)) {
                <ui-action-button [action]="rerunAction(row)" />
              }
              @if (messages()[row.kind ?? '']; as message) {
                <span class="text-xs text-charcoal-brown-600">{{ message }}</span>
              }
            </div>
            @if (row.state === 'FAILED' && row.failure; as failure) {
              <p class="mt-1 mb-0 font-mono text-xs text-cinnabar-800">{{ failed(failure) }}</p>
              @if (failure.excerpt) {
                <pre
                  class="mt-1 mb-0 max-h-48 overflow-auto rounded bg-charcoal-brown-950 p-2 text-xs whitespace-pre-wrap text-charcoal-brown-50"
                  >{{ failure.excerpt }}</pre>
              }
            }
          </li>
        }
      </ul>
    }

    @if (admin()) {
      <div class="mt-2 flex flex-wrap items-center gap-2">
        @if (!waiving()) {
          <ui-action-button [action]="startWaive" />
        } @else {
          <input
            class="h-8 min-w-48 flex-1 rounded-md border border-charcoal-brown-300 px-2 text-sm"
            type="text"
            [value]="reason()"
            (input)="reasonTyped($event)"
            placeholder="Why this fold is waived"
            [attr.aria-label]="'A reason for waiving automations on ' + request().summary"
          />
          <div class="flex">
            <ui-action-button [action]="confirmWaive()" join="start" />
            <ui-action-button [action]="cancelWaive()" join="end" />
          </div>
          <span class="text-xs text-charcoal-brown-500"
            >of <span class="font-mono">{{ fold() }}</span></span
          >
        }
      </div>
      @if (waiveMoved(); as moved) {
        <p class="mt-1 mb-0 text-sm text-sunflower-gold-900" role="alert">{{ moved }}</p>
      }
      @if (waiveFailure(); as failure) {
        <p class="mt-1 mb-0 text-sm text-cinnabar-700" role="alert">
          That waiver was not recorded — {{ failure }}.
        </p>
      }
    }
  `,
})
export class ReleaseAutomations {
  private readonly store = inject(ReleaseRequestStore);
  private readonly origins = inject(PlatformOrigins);

  readonly request = input.required<ReleaseRequest>();

  protected readonly rows = computed(() => this.request().automations ?? []);
  protected readonly fold = computed(() => shortShaOrNone(this.request().mergedSha));
  protected readonly sentence = automationSentence;
  protected readonly rerunnable = automationRerunnable;
  protected readonly failed = failureLine;

  /** Shown until a waiver is refused 403: this viewer is not an admin. */
  protected readonly admin = signal(true);

  /** The automation whose re-run is in flight. */
  private readonly rerunning = signal<string | null>(null);

  /** What a re-run of each automation answered, by kind. */
  protected readonly messages = signal<Readonly<Record<string, string>>>({});

  protected runHref(row: ReleaseAutomation): string | undefined {
    const origin = this.origins.page('ci');
    return row.runId && origin ? `${origin}/runs/${encodeURIComponent(row.runId)}` : undefined;
  }

  protected rerunAction(row: ReleaseAutomation): Action {
    return {
      label: 'Re-run',
      variant: 'muted',
      disabled: this.rerunning() === row.kind,
      callback: () => void this.rerun(row),
    };
  }

  private async rerun(row: ReleaseAutomation): Promise<void> {
    const kind = row.kind ?? '';
    const request = this.request();
    this.rerunning.set(kind);
    this.setMessage(kind, null);
    const outcome = await this.store.rerunAutomation(request.repoId ?? '', request.id ?? '', kind);
    this.rerunning.set(null);
    if (outcome.status >= 200 && outcome.status < 300) return;
    this.setMessage(
      kind,
      outcome.status === 409
        ? 'one is already running'
        : describeRefusal(outcome.status, outcome.message),
    );
  }

  private setMessage(kind: string, message: string | null): void {
    const next = { ...this.messages() };
    if (message) next[kind] = message;
    else delete next[kind];
    this.messages.set(next);
  }

  protected readonly waiving = signal(false);
  protected readonly reason = signal('');
  private readonly waiveBusy = signal(false);
  protected readonly waiveMoved = signal<string | null>(null);
  protected readonly waiveFailure = signal<string | null>(null);

  protected readonly startWaive: Action = {
    label: 'Waive for this fold',
    variant: 'muted',
    callback: () => {
      this.waiving.set(true);
      this.reason.set('');
      this.waiveMoved.set(null);
      this.waiveFailure.set(null);
    },
  };

  protected readonly confirmWaive = computed((): Action => ({
    label: 'Confirm waive',
    variant: 'success',
    disabled: this.waiveBusy() || !this.reason().trim(),
    callback: () => void this.waive(),
  }));

  protected readonly cancelWaive = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.waiveBusy(),
    callback: () => {
      this.waiving.set(false);
      this.reason.set('');
    },
  }));

  protected reasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  private async waive(): Promise<void> {
    const reason = this.reason().trim();
    if (!reason) return;
    const request = this.request();
    const fold = request.mergedSha ?? '';
    this.waiveBusy.set(true);
    this.waiveMoved.set(null);
    this.waiveFailure.set(null);
    const outcome = await this.store.waiveAutomations(
      request.repoId ?? '',
      request.id ?? '',
      fold,
      reason,
    );
    this.waiveBusy.set(false);
    if (outcome.request) {
      this.waiving.set(false);
      this.reason.set('');
      return;
    }
    if (outcome.status === 403) this.admin.set(false);
    const moved = movedFold(
      outcome.status,
      outcome.message,
      fold,
      'Nothing was waived',
      'The service would not take that waiver.',
    );
    if (moved) this.waiveMoved.set(moved);
    else this.waiveFailure.set(describeRefusal(outcome.status, outcome.message));
  }
}
