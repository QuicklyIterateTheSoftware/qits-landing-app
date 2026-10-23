import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import { describeRefusal } from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** What a 409 means here: the upstream finished, or was never building, by the time it landed. */
export const NO_LONGER_BUILDING = 'The upstream is no longer building';

/**
 * Override on one PENDING check of the `upstream-in-flight` gate (epic qits-897, gate 3): a person
 * lets the request start QA although the upstream request `upstream` (the check's name, its
 * qualified id) is still building. Built like `app-release-approval`: an optional note, then a
 * button that asks once ("Confirm override?") and acts on the second press, through
 * `ReleaseRequestStore.overrideUpstream`.
 *
 * The answered request takes the shown one's place, so the check turns PASSED and names who
 * overrode. A 403 (only a person may) shows the service's sentence. A 409 (the override is moot)
 * emits `moot`, and the store reads the request again: the check is likely gone by then, and this
 * component with it, so the row that holds the gate says the upstream is no longer building.
 */
@Component({
  selector: 'app-upstream-override',
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
        [attr.aria-label]="'A note on overriding ' + upstream()"
      />
      <ui-action-button [action]="override()" />
    </div>
    @if (refusal(); as refusal) {
      <p class="mt-1 mb-0 text-sm text-cinnabar-700" role="alert">{{ refusal }}</p>
    }
  `,
})
export class UpstreamOverride {
  private readonly store = inject(ReleaseRequestStore);

  readonly request = input.required<ReleaseRequest>();
  /** The upstream request to stop waiting for: the check's name, its qualified id. */
  readonly upstream = input.required<string>();
  /** The service found the override moot (409): the upstream named here is no longer building. */
  readonly moot = output<string>();

  /** Pressed once, waiting for its confirmation. */
  protected readonly pending = signal(false);
  protected readonly inFlight = signal(false);
  protected readonly note = signal('');
  /** Why the override was not taken, in the service's words where it gave them. */
  protected readonly refusal = signal<string | null>(null);

  protected readonly override = computed((): Action => ({
    label: this.pending() ? 'Confirm override?' : 'Override',
    variant: 'muted',
    disabled: this.inFlight(),
    details: {
      title: `Start QA without waiting for ${this.upstream()}`,
      items: [
        'Lifts the hold for this one upstream request only; another still building holds.',
        'A re-fold of either request keeps the override.',
      ],
    },
    callback: () => void this.press(),
  }));

  protected noteTyped(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  protected async press(): Promise<void> {
    this.refusal.set(null);
    if (!this.pending()) {
      this.pending.set(true);
      return;
    }
    this.pending.set(false);
    this.inFlight.set(true);
    const request = this.request();
    const outcome = await this.store.overrideUpstream(
      request.repoId ?? '',
      request.id ?? '',
      this.upstream(),
      this.note(),
    );
    this.inFlight.set(false);
    if (outcome.request) {
      this.note.set('');
      return;
    }
    if (outcome.status === 409) {
      this.moot.emit(this.upstream());
      return;
    }
    this.refusal.set(
      outcome.status === 403 && outcome.message
        ? outcome.message
        : `That override was not recorded — ${describeRefusal(outcome.status, outcome.message)}.`,
    );
  }
}
