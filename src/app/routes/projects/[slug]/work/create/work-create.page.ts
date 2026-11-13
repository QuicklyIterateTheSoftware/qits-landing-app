import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
  stay,
} from '@qits/angular';
import { IDEA } from '$core/ideas/ideas.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import {
  createWorkParams,
  isRoot,
  ROOT,
  TICKET_TYPES,
  workWriteRefusal,
  workWriteRunRefusal,
  type RootArchetype,
} from '$core/work/work-writes';
import { CREATE_WORK } from '$core/work/work-writes.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A new epic or ticket of the open project (epic qits-888), at
 * `/projects/<slug>/work/create`: its archetype, title and description, and for a ticket its kind
 * (bug or improvement) and impetus (why it came about, which the service requires of a ticket).
 *
 * The query fills it: `archetype`, `title`, `description` and `inspiredBy`, an idea's id. An idea's
 * page opens it that way (Create epic, Create ticket), and the form then says which idea inspires
 * the item (its title from its `IDEA` read, a `qitsResource` in the browser only, qits-2146; linked) and sends it as `inspiredBy`.
 *
 * Where each interaction leads is declared (epic qits-2000), and the buttons and the link carry the
 * marks of the outcomes they trigger:
 *
 * - `create-work-item`: Create sends `qitsMutation(CREATE_WORK)` (`createWork`, qits-2146), reads
 *   the project's work again (`SelectedWork.refreshed`: the service announces no creation) and leaves for the new item's page
 *   (`created`); a refusal stays (`refused`) and shows the service's `message` with the typed form
 *   kept.
 * - `cancel-work-create`: Cancel goes back to the idea it was opened from (`toIdea`), or to the
 *   project's work (`toWork`). Its button names only the one its click fires.
 * - `open-inspiring-idea`: the "Inspired by" link opens the idea (`open`).
 *
 * Staleness (qits-1270): reads the inspiring idea once; nothing to follow on a form.
 */
@Component({
  selector: 'app-work-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, PageLayoutComponent, QitsEntity, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="heading()">
        <form
          class="flex max-w-2xl flex-col gap-4 text-sm text-fg"
          (submit)="$event.preventDefault(); create()"
        >
          @if (inspiredBy(); as ideaId) {
            <p class="m-0" data-inspired-by>
              Inspired by
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
            </p>
          }
          <label class="flex flex-col gap-1">
            Archetype
            <select
              class="h-8 w-full max-w-xs rounded-md border border-line-strong px-2 text-sm"
              aria-label="Archetype"
              [value]="archetype()"
              (change)="setArchetype(value($event))"
            >
              @for (option of archetypes; track option) {
                <option [value]="option" [selected]="option === archetype()">
                  {{ option.toLowerCase() }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1">
            Title
            <input
              class="h-8 w-full rounded-md border border-line-strong px-2 text-sm"
              type="text"
              aria-label="Title"
              [value]="title()"
              (input)="title.set(value($event))"
            />
          </label>
          <label class="flex flex-col gap-1">
            Description
            <textarea
              class="min-h-32 w-full rounded-md border border-line-strong p-2 text-sm"
              aria-label="Description"
              [value]="description()"
              (input)="description.set(value($event))"
            ></textarea>
          </label>
          @if (archetype() === 'TICKET') {
            <label class="flex flex-col gap-1">
              Kind
              <select
                class="h-8 w-full max-w-xs rounded-md border border-line-strong px-2 text-sm"
                aria-label="Kind"
                [value]="ticketType()"
                (change)="ticketType.set(value($event))"
              >
                @for (option of ticketTypes; track option) {
                  <option [value]="option" [selected]="option === ticketType()">
                    {{ option.toLowerCase() }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1">
              Impetus
              <textarea
                class="min-h-16 w-full rounded-md border border-line-strong p-2 text-sm"
                aria-label="Impetus"
                [value]="impetus()"
                (input)="impetus.set(value($event))"
              ></textarea>
            </label>
          }
          <div class="flex justify-end gap-2">
            <ui-action-button [action]="cancelAction()" />
            <ui-action-button [action]="createAction()" />
          </div>
          @if (refusal(); as refusal) {
            <p class="m-0 text-sm text-danger" role="alert">{{ refusal }}</p>
          }
        </form>
      </app-page-layout>
    </div>
  `,
})
export class WorkCreatePage {
  private readonly selected = inject(SelectedProject);
  private readonly platform = inject(PLATFORM_ID);
  private readonly creating = qitsMutation(CREATE_WORK);
  private readonly work = inject(SelectedWork);

  /** Create: the new item's page, or the form kept with the refusal. */
  private readonly creation = outcomes('create-work-item', {
    created: exit('projects/:slug/work/detail/:id'),
    refused: stay(),
  });
  /** Cancel: back to the idea the form was opened from, or to the project's work. */
  private readonly cancelling = outcomes('cancel-work-create', {
    toIdea: exit('projects/:slug/ideas/detail/:ideaId'),
    toWork: exit('projects/:slug/work'),
  });
  /** The "Inspired by" link: the idea's page. */
  protected readonly inspiring = outcomes('open-inspiring-idea', {
    open: exit('projects/:slug/ideas/detail/:ideaId'),
  });

  protected readonly archetypes = ROOT;
  protected readonly ticketTypes = TICKET_TYPES;

  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly archetype = signal<RootArchetype>(
    isRoot(this.query.get('archetype') ?? undefined)
      ? (this.query.get('archetype') as RootArchetype)
      : 'EPIC',
  );
  protected readonly title = signal(this.query.get('title') ?? '');
  protected readonly description = signal(this.query.get('description') ?? '');
  protected readonly ticketType = signal<string>(TICKET_TYPES[1]);
  protected readonly impetus = signal('');
  /** The idea inspiring the item, from the query. */
  protected readonly inspiredBy = signal(this.query.get('inspiredBy') ?? '');

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  protected readonly heading = computed(() => `New ${this.archetype().toLowerCase()}`);

  /** The inspiring idea, for its title; in the browser only. */
  protected readonly idea = qitsResource(IDEA, () => {
    const id = this.inspiredBy();
    return id && isPlatformBrowser(this.platform) ? { path: { id } } : undefined;
  });

  protected readonly createAction = computed((): Action => ({
    label: this.busy() ? 'Creating…' : 'Create',
    variant: 'success',
    disabled: this.busy() || !this.title().trim() || !this.selected.project()?.id,
    callback: () => void this.create(),
    outcomes: [this.creation.created, this.creation.refused],
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.cancel(),
    outcomes: [this.inspiredBy() ? this.cancelling.toIdea : this.cancelling.toWork],
  }));

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected setArchetype(value: string): void {
    if (isRoot(value)) this.archetype.set(value);
  }

  private cancel(): void {
    const slug = this.slug();
    const ideaId = this.inspiredBy();
    void (ideaId
      ? this.cancelling.toIdea.go({ slug, ideaId })
      : this.cancelling.toWork.go({ slug }));
  }

  protected async create(): Promise<void> {
    const project = this.selected.project()?.id;
    if (!project || this.busy() || !this.title().trim()) return;
    this.busy.set(true);
    this.refusal.set(null);
    const params = createWorkParams({
      archetype: this.archetype(),
      project,
      title: this.title(),
      description: this.description(),
      ticketType: this.ticketType(),
      impetus: this.impetus(),
      inspiredBy: this.inspiredBy(),
    });
    const outcome = await this.creating.run(params).then(
      (created) =>
        created?.qualifiedId
          ? { qualifiedId: created.qualifiedId }
          : { refusal: workWriteRefusal(undefined, 201) },
      (error: unknown) => ({ refusal: workWriteRunRefusal(error) }),
    );
    if (outcome.refusal !== undefined) {
      this.busy.set(false);
      this.creation.refused.reach();
      this.refusal.set(outcome.refusal);
      return;
    }
    await this.work.refreshed();
    this.busy.set(false);
    void this.creation.created.go({ slug: this.slug(), id: outcome.qualifiedId ?? '' });
  }
}
