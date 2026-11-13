import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { qitsMutation } from '@qits/angular';
import { ProjectReleaseRequests } from '$core/projects/project-release-requests';
import { requestTitle, type AttributionFields } from '$core/projects/release-requests';
import { OPEN_RELEASE_REQUEST } from '$core/release-requests/open-release-request';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal, isChangeable } from '$core/release-requests/release-request-model';
import { WITHDRAW_RELEASE } from '$core/release-requests/release-request.operations';
import {
  addressOf,
  changeOutcome,
  withdrawParams,
} from '$core/release-requests/release-request-writes';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * Withdraw: calls a release request off (ported from qits-projects-frontend's release request
 * list). The first press shows an optional reason and asks "Confirm withdraw?"; the second sends
 * it. A blank reason leaves the service to name the caller. Drawn only while the request can still
 * be withdrawn (no tag cut yet); a refusal is said below the button. It is sent through
 * `qitsMutation(WITHDRAW_RELEASE)` (qits-2146); the answered request takes the shown one's place
 * on the request's page (`OPEN_RELEASE_REQUEST`), and the open project's list of requests is read
 * again (`ProjectReleaseRequests`).
 */
@Component({
  selector: 'app-release-withdraw',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block', '[class.hidden]': '!withdrawable()' },
  template: `
    <div class="flex flex-wrap items-center justify-end gap-2">
      @if (pending()) {
        <input
          class="h-8 min-w-48 rounded-md border border-line-strong px-2 text-sm"
          type="text"
          [value]="reason()"
          (input)="reasonTyped($event)"
          placeholder="Why (optional)"
          [attr.aria-label]="'Reason for withdrawing ' + title()"
        />
      }
      <ui-action-button [action]="action()" />
    </div>
    @if (failure(); as failure) {
      <p class="mt-1 mb-0 text-right text-sm text-danger" role="alert">
        Could not withdraw this request — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseWithdraw {
  private readonly open = inject(OPEN_RELEASE_REQUEST, { optional: true });
  private readonly injector = inject(Injector);
  /** A withdrawal reads the open project's requests again (looked up then: the shell's read). */
  private readonly withdrawal = qitsMutation(WITHDRAW_RELEASE, {
    affects: () => [this.injector.get(ProjectReleaseRequests).resource],
  });

  readonly request = input.required<
    Pick<ReleaseRequest, 'id' | 'repoId' | 'state'> & AttributionFields
  >();

  /** What the request carries, naming it in the reason's label (qits-1673). */
  protected readonly title = computed(() => requestTitle(this.request()));

  protected readonly withdrawable = computed(() => isChangeable(this.request()));

  /** Pressed once: the reason shows and the button asks for confirmation. */
  protected readonly pending = signal(false);
  protected readonly reason = signal('');
  private readonly inFlight = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly action = computed((): Action => ({
    label: this.pending() ? 'Confirm withdraw?' : 'Withdraw',
    variant: 'muted',
    disabled: this.inFlight(),
    callback: () => void this.press(),
  }));

  protected reasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  private async press(): Promise<void> {
    if (!this.pending()) {
      this.pending.set(true);
      this.reason.set('');
      this.failure.set(null);
      return;
    }
    const request = this.request();
    this.pending.set(false);
    this.inFlight.set(true);
    this.failure.set(null);
    const outcome = await changeOutcome(
      this.withdrawal,
      withdrawParams(addressOf(request), this.reason()),
    );
    this.inFlight.set(false);
    this.reason.set('');
    if (!outcome.request) {
      this.failure.set(describeRefusal(outcome.status, outcome.message));
      return;
    }
    this.open?.put(outcome.request);
  }
}
