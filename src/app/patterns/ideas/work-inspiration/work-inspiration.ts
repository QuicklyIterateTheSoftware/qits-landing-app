import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
} from '@qits/angular';
import { aboutProjectIdeas, IDEA_EVENTS } from '$core/ideas/idea-events';
import { IDEA, IDEA_LIST } from '$core/ideas/ideas.operations';
import { SET_WORK_INSPIRATION } from '$core/work/work.operations';
import { inspirable, workWriteRefusal } from '$core/work/work-writes.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A work item's inspiration on its page (epic qits-888): "Inspired by <idea title>", linking the
 * idea's page (the declared exit `open-work-inspiration` `open`, epic qits-2000), when the item
 * names one (`inspiredBy`; the idea's title from its `IDEA` read).
 *
 * On any archetype it can be set or changed (Choose, then one of the project's ideas, `IDEA_LIST`,
 * read on the first opening) and cleared, through `SET_WORK_INSPIRATION`; `changed` fires once the
 * service took it, and the page reads the item again. A refusal shows in the service's words. (qits-1792: a feature and a task used to be
 * excluded; the backend now accepts `inspiredBy` on every archetype.)
 *
 * Nothing is read until the item names an idea or Choose is pressed, so an item without one costs
 * no request.
 *
 * It reads through `qitsResource`s (in the browser only) and writes through `qitsMutation` (qits-2146), and marks what it
 * shows (qits-2141): the link is the inspiring idea from its read, the picker the list read, each
 * option an idea by its id.
 *
 * Staleness (qits-1270): `IDEA_EVENTS` about the project → the inspiring idea (a new title,
 * archived) and, once the picker has been opened, the project's ideas, each through its resource's
 * `refreshOn` (narrowed by `aboutProjectIdeas`, as `IdeasStore.follow` was).
 */
@Component({
  selector: 'app-work-inspiration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, QitsEntity, QitsEntityList, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-2 text-sm text-fg"
      aria-label="Inspiration"
      [class.hidden]="!shown()"
    >
      <div class="flex flex-wrap items-center gap-2">
        @if (inspiredBy(); as ideaId) {
          <span data-inspired-by
            >Inspired by
            @if (idea.hasValue() ? idea.value() : undefined; as read) {
              <a
                class="font-semibold text-accent no-underline hover:underline"
                [qitsExit]="inspiring.open"
                [exitParams]="{ slug: slug(), ideaId }"
                [qitsEntity]="read"
                entityKey="id"
                [entitySource]="idea"
                [fieldOf]="read"
                [qitsField]="{ derived: ['title'] }"
                >{{ read.title ?? ideaId }}</a
              >
            } @else {
              <a
                class="font-semibold text-accent no-underline hover:underline"
                [qitsExit]="inspiring.open"
                [exitParams]="{ slug: slug(), ideaId }"
                >{{ ideaId }}</a
              >
            }
          </span>
        } @else {
          <span class="text-fg-muted">Inspired by no idea.</span>
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
            class="h-8 w-full max-w-md rounded-md border border-line-strong px-2 text-sm"
            aria-label="Idea"
            [value]="picked()"
            [qitsEntityList]="list"
            (change)="picked.set(value($event))"
          >
            <option value="" disabled>Choose an idea…</option>
            @for (option of ideas(); track option.id) {
              <option
                [value]="option.id"
                [selected]="option.id === picked()"
                [qitsEntity]="option"
                entityKey="id"
                [fieldOf]="option"
                qitsField="title"
              >
                {{ option.title }}
              </option>
            }
          </select>
          <ui-action-button [action]="saveAction()" />
          <ui-action-button [action]="cancelAction()" />
        </div>
      }
      @if (failure(); as failure) {
        <p class="m-0 text-sm text-danger" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkInspiration {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly slug = input.required<string>();
  readonly projectId = input.required<string>();
  /** The item's qualified id. */
  readonly qualifiedId = input.required<string>();
  readonly archetype = input<string | undefined>(undefined);
  /** The idea the item names, if any. */
  readonly inspiredBy = input<string | undefined>(undefined);
  /** The service took a new inspiration, or the clearing of it. */
  readonly changed = output<void>();

  protected readonly inspiring = outcomes('open-work-inspiration', {
    open: exit('projects/:slug/ideas/detail/:ideaId'),
  });

  protected readonly editable = computed(() => inspirable(this.archetype()));
  protected readonly shown = computed(() => this.editable() || !!this.inspiredBy());

  protected readonly choosing = signal(false);
  protected readonly picked = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Whether the picker has been opened: the project's ideas are read from then on. */
  private readonly opened = signal(false);

  /** The idea events about the item's project. */
  private readonly ideaEvents = {
    names: IDEA_EVENTS,
    when: (event: Parameters<typeof aboutProjectIdeas>[0]) =>
      aboutProjectIdeas(event, this.projectId()),
  };

  /** The inspiring idea, whose title the link shows (its id until it is read). */
  protected readonly idea = qitsResource(
    IDEA,
    () => {
      const id = this.inspiredBy();
      return this.browser && id ? { path: { id } } : undefined;
    },
    { refreshOn: this.ideaEvents },
  );

  /** The project's ideas, for the picker, once it has been opened. */
  protected readonly list = qitsResource(
    IDEA_LIST,
    () => {
      const project = this.projectId();
      return this.opened() && project ? { query: { project } } : undefined;
    },
    { refreshOn: this.ideaEvents },
  );

  private readonly inspiring$ = qitsMutation(SET_WORK_INSPIRATION);

  /** The project's ideas that are not archived, for the picker. */
  protected readonly ideas = computed(() =>
    (this.list.hasValue() ? (this.list.value()?.ideas ?? []) : []).filter((idea) => !idea.archived),
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

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  private open(): void {
    this.failure.set(null);
    this.picked.set(this.inspiredBy() ?? '');
    this.choosing.set(true);
    if (this.list.status() === 'error') this.list.reload();
    this.opened.set(true);
  }

  private async write(ideaId: string | null): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const refusal = await this.inspiring$
      .run({ path: { qualifiedId: this.qualifiedId() }, body: { inspiredBy: ideaId } })
      .then(
        (patched) => (patched ? null : workWriteRefusal(undefined, 200)),
        (error: unknown) =>
          error instanceof QitsApiError
            ? workWriteRefusal(error.error, error.status)
            : workWriteRefusal(undefined, undefined),
      );
    this.writing.set(false);
    if (refusal !== null) {
      this.failure.set(refusal);
      return;
    }
    this.choosing.set(false);
    this.changed.emit();
  }
}
