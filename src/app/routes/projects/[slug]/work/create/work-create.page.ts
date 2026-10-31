import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ideaPath } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { SelectedProject } from '$core/projects/selected-project';
import { workItemPath } from '$core/workspaces/agent-attention';
import { WorkStore } from '$core/work/work.store';
import {
  isRoot,
  ROOT,
  TICKET_TYPES,
  WorkWritesStore,
  type RootArchetype,
} from '$core/work/work-writes.store';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * A new epic, ticket or campaign of the open project (epic qits-888), at
 * `/projects/<slug>/work/create`: its archetype, title and description, and for a ticket its kind
 * (bug or improvement) and impetus (why it came about, which the service requires of a ticket).
 *
 * The query fills it: `archetype`, `title`, `description` and `inspiredBy`, an idea's id. An idea's
 * page opens it that way (Create epic, Create ticket), and the form then says which idea inspires
 * the item (its title from `IdeasStore.loadIdea`, linked) and sends it as `inspiredBy`.
 *
 * Create sends `WorkWritesStore.create`, reads the project's work again (`WorkStore.refresh`: the
 * service announces no creation) and goes to the new item's page; a refusal shows the service's
 * `message` with the typed form kept. Cancel goes back to the idea, or to the work.
 *
 * Staleness (qits-1270): reads the inspiring idea once; nothing to follow on a form.
 */
@Component({
  selector: 'app-work-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, PageLayoutComponent, RouterLink],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="heading()">
        <form
          class="flex max-w-2xl flex-col gap-4 text-sm text-charcoal-brown-800"
          (submit)="$event.preventDefault(); create()"
        >
          @if (inspiredBy(); as ideaId) {
            <p class="m-0" data-inspired-by>
              Inspired by
              <a
                class="font-semibold text-ocean-deep-700 no-underline hover:underline"
                [routerLink]="ideaLink(ideaId)"
                >{{ ideaTitle() }}</a
              >
            </p>
          }
          <label class="flex flex-col gap-1">
            Archetype
            <select
              class="h-8 w-full max-w-xs rounded-md border border-charcoal-brown-300 px-2 text-sm"
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
              class="h-8 w-full rounded-md border border-charcoal-brown-300 px-2 text-sm"
              type="text"
              aria-label="Title"
              [value]="title()"
              (input)="title.set(value($event))"
            />
          </label>
          <label class="flex flex-col gap-1">
            Description
            <textarea
              class="min-h-32 w-full rounded-md border border-charcoal-brown-300 p-2 text-sm"
              aria-label="Description"
              [value]="description()"
              (input)="description.set(value($event))"
            ></textarea>
          </label>
          @if (archetype() === 'TICKET') {
            <label class="flex flex-col gap-1">
              Kind
              <select
                class="h-8 w-full max-w-xs rounded-md border border-charcoal-brown-300 px-2 text-sm"
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
                class="min-h-16 w-full rounded-md border border-charcoal-brown-300 p-2 text-sm"
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
            <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ refusal }}</p>
          }
        </form>
      </app-page-layout>
    </div>
  `,
})
export class WorkCreatePage {
  private readonly selected = inject(SelectedProject);
  private readonly writes = inject(WorkWritesStore);
  private readonly work = inject(WorkStore);
  private readonly ideas = inject(IdeasStore);
  private readonly router = inject(Router);

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

  protected readonly heading = computed(() => `New ${this.archetype().toLowerCase()}`);

  protected readonly ideaTitle = computed(() => {
    const id = this.inspiredBy();
    return this.ideas.ideaOf(id)?.idea?.title ?? id;
  });

  protected readonly createAction = computed((): Action => ({
    label: this.busy() ? 'Creating…' : 'Create',
    variant: 'success',
    disabled: this.busy() || !this.title().trim() || !this.selected.project()?.id,
    callback: () => void this.create(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.cancel(),
  }));

  constructor() {
    const id = this.inspiredBy();
    if (id && isPlatformBrowser(inject(PLATFORM_ID))) void this.ideas.loadIdea(id);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected setArchetype(value: string): void {
    if (isRoot(value)) this.archetype.set(value);
  }

  protected ideaLink(ideaId: string): string {
    return ideaPath(this.selected.slug() ?? '', ideaId);
  }

  private cancel(): void {
    const slug = this.selected.slug() ?? '';
    const idea = this.inspiredBy();
    void this.router.navigateByUrl(idea ? ideaPath(slug, idea) : `/projects/${slug}/work`);
  }

  protected async create(): Promise<void> {
    const project = this.selected.project()?.id;
    if (!project || this.busy() || !this.title().trim()) return;
    this.busy.set(true);
    this.refusal.set(null);
    const outcome = await this.writes.create({
      archetype: this.archetype(),
      project,
      title: this.title(),
      description: this.description(),
      ticketType: this.ticketType(),
      impetus: this.impetus(),
      inspiredBy: this.inspiredBy(),
    });
    if (!outcome.ok) {
      this.busy.set(false);
      this.refusal.set(outcome.refusal);
      return;
    }
    await this.work.refresh(project);
    this.busy.set(false);
    void this.router.navigateByUrl(
      workItemPath(this.selected.slug() ?? '', outcome.value.qualifiedId ?? ''),
    );
  }
}
