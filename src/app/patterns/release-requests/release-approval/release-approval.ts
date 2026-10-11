import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal, shortShaOrNone } from '$core/release-requests/release-request-model';
import { movedFold } from '$core/release-requests/release-pipeline';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

type Decision = 'approve' | 'decline';

/**
 * The person's half of the second gate: an optional note, then Approve or Decline of the fold on
 * show (ported from qits-projects-frontend's gates and pipeline panels). Each button asks once
 * ("Confirm approve?") and decides on the second press.
 *
 * The fold the reader saw travels with the decision. A push that lands first is refused (409)
 * naming the fold the request is on now, and the panel says the fold changed rather than calling
 * it a failure. The answered request takes the shown one's place (`ReleaseRequestStore`).
 */
@Component({
  selector: 'app-release-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <input
        class="h-8 min-w-48 flex-1 rounded-md border border-charcoal-brown-300 px-2 text-sm"
        type="text"
        [value]="note()"
        (input)="noteTyped($event)"
        placeholder="A note (optional)"
        [attr.aria-label]="'A note on the decision about ' + request().summary"
      />
      <div class="flex">
        <ui-action-button [action]="approve()" join="start" />
        <ui-action-button [action]="decline()" join="end" />
      </div>
      <span class="text-xs text-charcoal-brown-500"
        >of <span class="font-mono">{{ fold() }}</span></span
      >
    </div>
    @if (moved(); as moved) {
      <p class="mt-1 mb-0 text-sm text-sunflower-gold-900" role="alert">{{ moved }}</p>
    }
    @if (failure(); as failure) {
      <p class="mt-1 mb-0 text-sm text-cinnabar-700" role="alert">
        That decision was not recorded — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseApproval {
  private readonly store = inject(ReleaseRequestStore);

  readonly request = input.required<ReleaseRequest>();

  protected readonly fold = computed(() => shortShaOrNone(this.request().mergedSha));

  /** The decision pressed once, waiting for its confirmation. */
  protected readonly pending = signal<Decision | null>(null);
  protected readonly note = signal('');
  protected readonly inFlight = signal<Decision | null>(null);
  /** The fold moved, or the service refused the decision (409), in its words. */
  protected readonly moved = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly approve = computed((): Action => ({
    label: this.pending() === 'approve' ? 'Confirm approve?' : 'Approve release',
    variant: 'success',
    disabled: this.inFlight() !== null,
    callback: () => void this.press('approve'),
  }));

  protected readonly decline = computed((): Action => ({
    label: this.pending() === 'decline' ? 'Confirm decline?' : 'Decline release',
    variant: 'muted',
    disabled: this.inFlight() !== null,
    callback: () => void this.press('decline'),
  }));

  protected noteTyped(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected async press(decision: Decision): Promise<void> {
    this.failure.set(null);
    this.moved.set(null);
    if (this.pending() !== decision) {
      this.pending.set(decision);
      return;
    }
    // The fold this page drew, not whatever the request holds by the time the answer comes.
    const request = this.request();
    const fold = request.mergedSha ?? '';
    this.pending.set(null);
    this.inFlight.set(decision);
    const repoId = request.repoId ?? '';
    const requestId = request.id ?? '';
    const outcome =
      decision === 'approve'
        ? await this.store.approve(repoId, requestId, fold, this.note())
        : await this.store.decline(repoId, requestId, fold, this.note());
    this.inFlight.set(null);
    if (outcome.request) {
      this.note.set('');
      return;
    }
    const moved = movedFold(
      outcome.status,
      outcome.message,
      fold,
      'Nothing was decided',
      'The service would not take that decision.',
    );
    if (moved) this.moved.set(moved);
    else this.failure.set(describeRefusal(outcome.status, outcome.message));
  }
}
