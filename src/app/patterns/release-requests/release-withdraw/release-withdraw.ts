import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal, isChangeable } from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * Withdraw: calls a release request off (ported from qits-projects-frontend's release request
 * list). The first press shows an optional reason and asks "Confirm withdraw?"; the second sends
 * it. A blank reason leaves the service to name the caller. Drawn only while the request can still
 * be withdrawn (no tag cut yet); a refusal is said below the button. After a withdrawal the open
 * project's list of requests is read again.
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
          class="h-8 min-w-48 rounded-md border border-charcoal-brown-300 px-2 text-sm"
          type="text"
          [value]="reason()"
          (input)="reasonTyped($event)"
          placeholder="Why (optional)"
          [attr.aria-label]="'Reason for withdrawing ' + request().summary"
        />
      }
      <ui-action-button [action]="action()" />
    </div>
    @if (failure(); as failure) {
      <p class="mt-1 mb-0 text-right text-sm text-cinnabar-700" role="alert">
        Could not withdraw this request — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseWithdraw {
  private readonly store = inject(ReleaseRequestStore);
  private readonly projects = inject(ProjectsStore);
  private readonly selected = inject(SelectedProject);

  readonly request = input.required<Pick<ReleaseRequest, 'id' | 'repoId' | 'state' | 'summary'>>();

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
    const outcome = await this.store.withdraw(
      request.repoId ?? '',
      request.id ?? '',
      this.reason(),
    );
    this.inFlight.set(false);
    this.reason.set('');
    if (!outcome.request) {
      this.failure.set(describeRefusal(outcome.status, outcome.message));
      return;
    }
    const projectId = this.selected.project()?.id;
    if (projectId) void this.projects.refreshReleaseRequests(projectId);
  }
}
