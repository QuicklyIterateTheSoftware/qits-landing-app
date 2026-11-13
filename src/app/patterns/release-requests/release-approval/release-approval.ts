import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { QitsEntity, QitsField, qitsMutation } from '@qits/angular';
import type { ApprovalOffer } from '$core/release-requests/approval-requirements';
import { requestTitle } from '$core/projects/release-requests';
import { OPEN_RELEASE_REQUEST } from '$core/release-requests/open-release-request';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal, shortShaOrNone } from '$core/release-requests/release-request-model';
import {
  APPROVE_RELEASE,
  DECLINE_RELEASE,
} from '$core/release-requests/release-request.operations';
import {
  addressOf,
  changeOutcome,
  decisionParams,
} from '$core/release-requests/release-request-writes';
import { movedFold } from '$core/release-requests/release-pipeline';
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
 * it a failure. Each is sent through `qitsMutation` (`APPROVE_RELEASE`, `DECLINE_RELEASE`,
 * qits-2146); the answered request takes the shown one's place (`OPEN_RELEASE_REQUEST`).
 *
 * Which of the two it offers is `offer` (epic qits-1038): Approve only while the viewer may satisfy
 * an open requirement, Decline only while they may satisfy any; both when nothing says otherwise.
 */
@Component({
  selector: 'app-release-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, QitsEntity, QitsField],
  host: { class: 'block' },
  template: `
    @if (offer().note; as note) {
      <p class="m-0 text-sm text-fg-soft">{{ note }}</p>
    }
    @if (offer().approve || offer().decline) {
      <div class="flex flex-wrap items-center gap-2">
        <input
          class="h-8 min-w-48 flex-1 rounded-md border border-line-strong px-2 text-sm"
          type="text"
          [value]="note()"
          (input)="noteTyped($event)"
          placeholder="A note (optional)"
          [attr.aria-label]="'A note on the decision about ' + title()"
        />
        <div class="flex">
          @if (offer().approve) {
            <ui-action-button [action]="approve()" [join]="offer().decline ? 'start' : 'none'" />
          }
          @if (offer().decline) {
            <ui-action-button [action]="decline()" [join]="offer().approve ? 'end' : 'none'" />
          }
        </div>
        <span class="text-xs text-fg-muted" [qitsEntity]="request()" entityKey="id"
          >of
          <span class="font-mono" [fieldOf]="request()" [qitsField]="{ derived: ['mergedSha'] }">{{
            fold()
          }}</span></span
        >
      </div>
    }
    @if (moved(); as moved) {
      <p class="mt-1 mb-0 text-sm text-warning" role="alert">{{ moved }}</p>
    }
    @if (failure(); as failure) {
      <p class="mt-1 mb-0 text-sm text-danger" role="alert">
        That decision was not recorded — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseApproval {
  private readonly open = inject(OPEN_RELEASE_REQUEST, { optional: true });
  private readonly approval = qitsMutation(APPROVE_RELEASE);
  private readonly declining = qitsMutation(DECLINE_RELEASE);

  readonly request = input.required<ReleaseRequest>();
  /** Which decisions the viewer is offered (`approvalOffer`); both unless something says otherwise. */
  readonly offer = input<ApprovalOffer>({ approve: true, decline: true, note: null });

  protected readonly fold = computed(() => shortShaOrNone(this.request().mergedSha));
  /** What the request carries, naming it in the note's label (qits-1673). */
  protected readonly title = computed(() => requestTitle(this.request()));

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
    const params = decisionParams(addressOf(request), fold, this.note());
    const outcome = await changeOutcome(
      decision === 'approve' ? this.approval : this.declining,
      params,
    );
    this.inFlight.set(null);
    if (outcome.request) {
      this.note.set('');
      this.open?.put(outcome.request);
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
