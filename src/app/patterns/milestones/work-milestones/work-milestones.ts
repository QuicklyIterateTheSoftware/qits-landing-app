import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MilestoneRef } from '$core/milestones/milestone-criteria';
import { milestonePath } from '$core/milestones/milestone-path';
import { MilestonesStore } from '$core/milestones/milestones.store';
import { utcMinute } from '$core/projects/release-requests';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';

/**
 * A work item's milestones on its page (epic qits-615): each milestone it needs, linking its page,
 * with "met since <date>" or "not met", and Detach (`MilestonesStore.detach`). "Add a milestone"
 * opens a picker of the project's other milestones (`MilestonesStore.loadList`, read on the first
 * opening) and Attach sends `MilestonesStore.attach`. `changed` fires once the service took a
 * write, and the page reads the item and the project's work again (no event follows an attach or a
 * detach). A refusal shows in the service's words.
 *
 * The item needs its milestones all met before it may start; none of this is a block (a problem
 * found during work) or an agent's wait, and the words here never say "waiting".
 */
@Component({
  selector: 'app-work-milestones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, RouterLink],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-2 text-sm text-charcoal-brown-800" aria-label="Milestones">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Milestones</h2>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        @for (milestone of milestones(); track milestone.id) {
          <li class="flex flex-wrap items-center gap-2" data-work-milestone>
            <a
              class="font-semibold text-ocean-deep-700 no-underline hover:underline"
              [routerLink]="link(milestone.id)"
              >{{ milestone.displayName }}</a
            >
            @if (milestone.satisfiedAt) {
              <ui-chip [label]="'met since ' + date(milestone.satisfiedAt)" tone="ok" />
            } @else {
              <ui-chip label="not met" tone="neutral" />
            }
            <ui-action-button [action]="detachAction(milestone)" />
          </li>
        } @empty {
          <li class="text-charcoal-brown-500">It needs no milestone.</li>
        }
      </ul>
      @if (choosing()) {
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="h-8 w-full max-w-md rounded-md border border-charcoal-brown-300 px-2 text-sm"
            aria-label="Milestone"
            [value]="picked()"
            (change)="picked.set(value($event))"
          >
            <option value="" disabled>Choose a milestone…</option>
            @for (milestone of choices(); track milestone.id) {
              <option [value]="milestone.id" [selected]="milestone.id === picked()">
                {{ milestone.displayName }}{{ milestone.met ? ' (met)' : '' }}
              </option>
            }
          </select>
          <ui-action-button [action]="attachAction()" />
          <ui-action-button [action]="cancelAction()" />
        </div>
        <p class="m-0 text-charcoal-brown-500" [class.hidden]="!emptyChoices()">
          The project has no other milestone.
          <a class="text-ocean-deep-700 underline" [routerLink]="link()">Make one</a>
        </p>
      } @else {
        <div><ui-action-button [action]="chooseAction()" /></div>
      }
      @if (failure(); as failure) {
        <p class="m-0 text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkMilestones {
  private readonly store = inject(MilestonesStore);

  readonly slug = input.required<string>();
  readonly projectId = input.required<string>();
  /** The item's qualified id. */
  readonly qualifiedId = input.required<string>();
  /** The milestones it needs, in the order attached. */
  readonly milestones = input<readonly MilestoneRef[]>([]);
  /** The service took an attach or a detach. */
  readonly changed = output<void>();

  protected readonly choosing = signal(false);
  protected readonly picked = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** The project's milestones the item does not need yet. */
  protected readonly choices = computed(() => {
    const attached = new Set(this.milestones().map((m) => m.id));
    return (this.store.listOf(this.projectId())?.milestones ?? []).filter(
      (m) => !attached.has(m.id),
    );
  });

  protected readonly emptyChoices = computed(
    () => this.store.listOf(this.projectId())?.status === 'loaded' && !this.choices().length,
  );

  protected readonly chooseAction = computed((): Action => ({
    label: 'Add a milestone',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.open(),
  }));

  protected readonly attachAction = computed((): Action => ({
    label: this.writing() ? 'Attaching…' : 'Attach',
    variant: 'success',
    disabled: this.writing() || !this.picked(),
    callback: () => void this.write(() => this.store.attach(this.qualifiedId(), this.picked())),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.choosing.set(false),
  }));

  protected detachAction(milestone: MilestoneRef): Action {
    return {
      label: 'Detach',
      variant: 'muted',
      disabled: this.writing() || !milestone.id,
      callback: () =>
        void this.write(() => this.store.detach(this.qualifiedId(), milestone.id ?? '')),
    };
  }

  protected link(id?: string): string {
    return milestonePath(this.slug(), id);
  }

  protected readonly date = utcMinute;

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  private open(): void {
    this.failure.set(null);
    this.picked.set('');
    this.choosing.set(true);
    void this.store.loadList(this.projectId());
  }

  private async write(
    send: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: string }>,
  ): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await send();
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.choosing.set(false);
    this.changed.emit();
  }
}
