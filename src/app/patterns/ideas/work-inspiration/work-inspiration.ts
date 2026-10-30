import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ideaPath } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { inspirable, WorkWritesStore } from '$core/work/work-writes.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A work item's inspiration on its page (epic qits-888): "Inspired by <idea title>", linking the
 * idea's page, when the item names one (`inspiredBy`; the idea's title from `IdeasStore.loadIdea`).
 *
 * On an epic, a ticket or a campaign it can be set or changed (Choose, then one of the project's
 * ideas, `IdeasStore.loadList`, read on the first opening) and cleared, through
 * `WorkWritesStore.setInspiredBy`; `changed` fires once the service took it, and the page reads the
 * item again. A refusal shows in the service's words. A feature or a task never names an idea.
 *
 * Nothing is read until the item names an idea or Choose is pressed, so an item without one costs
 * no request.
 *
 * Staleness (qits-1270): `IDEA_EVENTS` about the project → the inspiring idea
 * (`IdeasStore.refreshIdea`: a new title, archived) and, while the picker has been opened, the
 * project's ideas (`refreshList`), through `IdeasStore.follow`.
 */
@Component({
  selector: 'app-work-inspiration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, RouterLink],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-2 text-sm text-charcoal-brown-800"
      aria-label="Inspiration"
      [class.hidden]="!shown()"
    >
      <div class="flex flex-wrap items-center gap-2">
        @if (inspiredBy(); as ideaId) {
          <span data-inspired-by
            >Inspired by
            <a
              class="font-semibold text-ocean-deep-700 no-underline hover:underline"
              [routerLink]="link(ideaId)"
              >{{ ideaTitle() }}</a
            ></span
          >
        } @else {
          <span class="text-charcoal-brown-500">Inspired by no idea.</span>
        }
        @if (editable()) {
          <ui-action-button [action]="chooseAction()" />
          @if (inspiredBy()) {
            <ui-action-button [action]="clearAction()" />
          }
        }
      </div>
      @if (choosing()) {
        <div class="flex flex-wrap items-center gap-2">
          <select
            class="h-8 w-full max-w-md rounded-md border border-charcoal-brown-300 px-2 text-sm"
            aria-label="Idea"
            [value]="picked()"
            (change)="picked.set(value($event))"
          >
            <option value="" disabled>Choose an idea…</option>
            @for (idea of ideas(); track idea.id) {
              <option [value]="idea.id" [selected]="idea.id === picked()">{{ idea.title }}</option>
            }
          </select>
          <ui-action-button [action]="saveAction()" />
          <ui-action-button [action]="cancelAction()" />
        </div>
      }
      @if (failure(); as failure) {
        <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkInspiration {
  private readonly ideasStore = inject(IdeasStore);
  private readonly writes = inject(WorkWritesStore);

  readonly slug = input.required<string>();
  readonly projectId = input.required<string>();
  /** The item's qualified id. */
  readonly qualifiedId = input.required<string>();
  readonly archetype = input<string | undefined>(undefined);
  /** The idea the item names, if any. */
  readonly inspiredBy = input<string | undefined>(undefined);
  /** The service took a new inspiration, or the clearing of it. */
  readonly changed = output<void>();

  protected readonly editable = computed(() => inspirable(this.archetype()));
  protected readonly shown = computed(() => this.editable() || !!this.inspiredBy());

  protected readonly choosing = signal(false);
  protected readonly picked = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** The inspiring idea's title, once read; its id until then. */
  protected readonly ideaTitle = computed(() => {
    const id = this.inspiredBy();
    if (!id) return '';
    return this.ideasStore.ideaOf(id)?.idea?.title ?? id;
  });

  /** The project's ideas that are not archived, for the picker. */
  protected readonly ideas = computed(
    () => this.ideasStore.listOf(this.projectId())?.ideas.filter((idea) => !idea.archived) ?? [],
  );

  protected readonly chooseAction = computed((): Action => ({
    label: this.inspiredBy() ? 'Change' : 'Choose an idea',
    variant: 'muted',
    disabled: this.writing() || this.choosing(),
    callback: () => this.open(),
  }));

  protected readonly clearAction = computed((): Action => ({
    label: 'Clear',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => void this.write(null),
  }));

  protected readonly saveAction = computed((): Action => ({
    label: this.writing() ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: this.writing() || !this.picked(),
    callback: () => void this.write(this.picked()),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.choosing.set(false),
  }));

  protected link(ideaId: string): string {
    return ideaPath(this.slug(), ideaId);
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  constructor() {
    effect(() => {
      const id = this.inspiredBy();
      if (id) untracked(() => void this.ideasStore.loadIdea(id));
    });
    this.ideasStore.follow(
      inject(DestroyRef),
      () => (this.inspiredBy() || this.choosing() ? this.projectId() : undefined),
      () => {
        const id = this.inspiredBy();
        if (id) void this.ideasStore.refreshIdea(id);
        if (this.ideasStore.listOf(this.projectId())) {
          void this.ideasStore.refreshList(this.projectId());
        }
      },
    );
  }

  private open(): void {
    this.failure.set(null);
    this.picked.set(this.inspiredBy() ?? '');
    this.choosing.set(true);
    void this.ideasStore.loadList(this.projectId());
  }

  private async write(ideaId: string | null): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await this.writes.setInspiredBy(this.qualifiedId(), ideaId);
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.choosing.set(false);
    this.changed.emit();
  }
}
