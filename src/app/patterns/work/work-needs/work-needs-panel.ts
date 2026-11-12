import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NEED_STATUSES, type NeedView } from '$core/work/work-needs';
import { WorkWritesStore, type NeedDraft } from '$core/work/work-writes.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { WorkRef } from '$patterns/work/work-ref/work-ref';

/**
 * A work item's needs on its page (epic qits-1899): each item it needs, linked (`app-work-ref`),
 * the status it needs, where that item stands now, and whether the need is met. Remove drops one;
 * Add a need asks for an item of the project (its qualified id, `qits-1897`) and a status (the walk,
 * then DROPPED: `NEED_STATUSES`). Each write sends the whole list through
 * `WorkWritesStore.setNeeds` (`patchWork` with `needs`; `[]` clears it). `changed` fires once the
 * service took it, and the page reads the item and the project's work again: the answer does not
 * carry the needs, and no event follows the edit. A refusal (an unknown item, an ISSUE, the item
 * itself, a cycle) shows in the service's words.
 *
 * The page draws it for every archetype but ISSUE, which cannot need anything. A need is ordering,
 * not a block or an agent's wait: the words here never say "waiting".
 */
@Component({
  selector: 'app-work-needs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, WorkRef],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm text-fg" aria-label="Needs">
      <h2 class="m-0 text-base font-semibold text-fg">Needs</h2>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        @for (need of needs(); track need.qualifiedId) {
          <li class="flex flex-wrap items-center gap-2" data-work-need>
            <app-work-ref [qualifiedId]="need.qualifiedId ?? ''" />
            <span
              >at <span class="font-semibold">{{ word(need.status) }}</span></span
            >
            @if (need.currentStatus) {
              <span class="text-fg-muted">(now {{ word(need.currentStatus) }})</span>
            }
            @if (need.met) {
              <ui-chip label="met" tone="ok" />
            } @else {
              <ui-chip label="not met" tone="neutral" />
            }
            <ui-action-button [action]="removeAction(need)" />
          </li>
        } @empty {
          <li class="text-fg-muted">It needs no other item.</li>
        }
      </ul>
      @if (adding()) {
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="h-8 w-40 rounded-md border border-line-strong px-2 font-mono text-sm"
            type="text"
            aria-label="Needed item"
            placeholder="qits-1897"
            [value]="item()"
            (input)="item.set(value($event))"
          />
          <select
            class="h-8 rounded-md border border-line-strong px-2 text-sm"
            aria-label="Needed status"
            [value]="status()"
            (change)="status.set(value($event))"
          >
            @for (s of statuses; track s) {
              <option [value]="s" [selected]="s === status()">{{ word(s) }}</option>
            }
          </select>
          <ui-action-button [action]="addAction()" />
          <ui-action-button [action]="cancelAction()" />
        </div>
      } @else {
        <div><ui-action-button [action]="openAction()" /></div>
      }
      @if (failure(); as failure) {
        <p class="m-0 text-danger" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkNeedsPanel {
  private readonly writes = inject(WorkWritesStore);

  /** The item's qualified id. */
  readonly qualifiedId = input.required<string>();
  /** What it needs now, in order. */
  readonly needs = input<readonly NeedView[]>([]);
  /** The service took a write. */
  readonly changed = output<void>();

  protected readonly statuses = NEED_STATUSES;

  protected readonly adding = signal(false);
  protected readonly item = signal('');
  protected readonly status = signal<string>('VERIFIED');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly openAction = computed((): Action => ({
    label: 'Add a need',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.open(),
  }));

  protected readonly addAction = computed((): Action => ({
    label: this.writing() ? 'Adding…' : 'Add',
    variant: 'success',
    disabled: this.writing() || !this.item().trim(),
    callback: () => void this.add(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.adding.set(false),
  }));

  protected removeAction(need: NeedView): Action {
    return {
      label: 'Remove',
      variant: 'muted',
      disabled: this.writing(),
      callback: () => void this.write(this.drafts().filter((d) => d.item !== this.refOf(need))),
    };
  }

  /** A status word as the panel shows it: `READY_FOR_DEV` → `ready for dev`. */
  protected word(status: string | undefined): string {
    return (status ?? '').toLowerCase().replaceAll('_', ' ');
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /** The needs as a write names them: the item by qualified id (else id), and its status. */
  private drafts(): NeedDraft[] {
    return this.needs().flatMap((need) => {
      const item = this.refOf(need);
      return item && need.status ? [{ item, status: need.status }] : [];
    });
  }

  private refOf(need: NeedView): string {
    return need.qualifiedId || need.id || '';
  }

  private open(): void {
    this.failure.set(null);
    this.item.set('');
    this.status.set('VERIFIED');
    this.adding.set(true);
  }

  /** The typed need appended to the list, or put in place of the same item's. */
  private async add(): Promise<void> {
    const item = this.item().trim();
    if (!item) return;
    const rest = this.drafts().filter((d) => d.item !== item);
    await this.write([...rest, { item, status: this.status() }]);
  }

  private async write(needs: readonly NeedDraft[]): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await this.writes.setNeeds(this.qualifiedId(), needs);
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.adding.set(false);
    this.changed.emit();
  }
}
