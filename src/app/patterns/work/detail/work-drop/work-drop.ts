import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { WorkEntry } from '$core/work/work.consumes';
import { OUTCOME_OPTIONS, referenceRequired, type WorkOutcome } from '$core/work/work-outcome';
import { WorkStore } from '$core/work/work.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * The Drop action's own form (qits-248), opened in place of sending the move at once (ported from
 * the detail page's other forms, `work-comments.ts`'s box and `release-withdraw.ts`'s reason): an
 * outcome (required — the six values the wire names, `work-outcome.ts`) and, for DUPLICATE,
 * RESOLVED_ELSEWHERE and SUPERSEDED, a reference naming the item that resolved it (a qualified id,
 * e.g. `qits-378`, or a UUID). Confirm drop sends `WorkStore.drop`, which carries both into the
 * move; Cancel asks nothing. A 400 from the service (an outcome the move's target does not allow,
 * a missing or forbidden reference) shows below the buttons and the typed form stays, so it can be
 * fixed and sent again.
 *
 * `dropped` fires once the move went through (the page then closes the form, as the item has left
 * its old status and the form's job is done); `cancelled` on Cancel.
 */
@Component({
  selector: 'app-work-drop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col gap-3 rounded-md border border-cinnabar-200 bg-cinnabar-50 p-4"
      role="group"
      [attr.aria-label]="'Drop ' + (entry().qualifiedId ?? '')"
    >
      <p class="m-0 text-sm font-semibold text-charcoal-brown-900">
        Drop {{ entry().qualifiedId }} — why is it closed?
      </p>
      <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
        Outcome
        <select
          class="h-8 w-full max-w-xs rounded-md border border-charcoal-brown-300 px-2 text-sm"
          aria-label="Outcome"
          [value]="outcome() ?? ''"
          (change)="outcomeChanged($event)"
        >
          <option value="" disabled>Choose an outcome…</option>
          @for (option of options; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      @if (needsReference()) {
        <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
          Reference
          <input
            class="h-8 w-full max-w-xs rounded-md border border-charcoal-brown-300 px-2 text-sm"
            type="text"
            aria-label="Reference"
            [value]="reference()"
            (input)="referenceTyped($event)"
            placeholder="qits-378"
          />
        </label>
      }
      <div class="flex justify-end gap-2">
        <ui-action-button [action]="cancelAction()" />
        <ui-action-button [action]="confirmAction()" />
      </div>
      @if (failure(); as failure) {
        <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </div>
  `,
})
export class WorkDrop {
  private readonly store = inject(WorkStore);

  /** The project the item belongs to, for `WorkStore.drop`. */
  readonly projectId = input.required<string>();
  readonly entry = input.required<WorkEntry>();
  /** The move went through: the item has left its old status. */
  readonly dropped = output<void>();
  readonly cancelled = output<void>();

  protected readonly options = OUTCOME_OPTIONS;

  protected readonly outcome = signal<WorkOutcome | null>(null);
  protected readonly reference = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Whether the chosen outcome needs a reference (DUPLICATE, RESOLVED_ELSEWHERE, SUPERSEDED). */
  protected readonly needsReference = computed(() => referenceRequired(this.outcome()));

  protected readonly valid = computed(() => {
    if (!this.outcome()) return false;
    return !this.needsReference() || this.reference().trim().length > 0;
  });

  protected readonly confirmAction = computed((): Action => ({
    label: this.writing() ? 'Dropping…' : 'Confirm drop',
    variant: 'danger',
    disabled: !this.valid() || this.writing(),
    callback: () => void this.confirm(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.cancelled.emit(),
  }));

  protected outcomeChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.outcome.set(value ? (value as WorkOutcome) : null);
    this.failure.set(null);
  }

  protected referenceTyped(event: Event): void {
    this.reference.set((event.target as HTMLInputElement).value);
    this.failure.set(null);
  }

  private async confirm(): Promise<void> {
    const outcome = this.outcome();
    if (!outcome || !this.valid() || this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const reference = this.needsReference() ? this.reference().trim() : undefined;
    const { status, refusal } = await this.store.drop(
      this.projectId(),
      this.entry(),
      outcome,
      reference,
    );
    this.writing.set(false);
    if (!status) {
      this.failure.set(refusal ?? 'The move failed.');
      return;
    }
    this.dropped.emit();
  }
}
