import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { map } from 'rxjs';
import { ideaStatusTone } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Markdown } from '$ui/components/markdown/markdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * One idea's page (epic qits-888), at `/projects/<slug>/ideas/detail/<idea id>`
 * (`IdeasStore.loadIdea`): its derived status, whether it is archived (and why), its description
 * (Markdown), the idea enabling it (a link, with a hint when that idea is archived), the ideas it
 * enables, and the work naming it as its inspiration, each linked to its page
 * (`/projects/<slug>/work/detail/<qualified id>`).
 *
 * Its actions: Edit (`detail/<id>/edit`); Archive, which asks for the reason the service requires
 * before it sends `IdeasStore.archive`, or Unarchive on an archived idea; and Create epic / Create
 * ticket, which open the work create form (`work/create`) filled with the idea's title and
 * description and naming it as the inspiration (`inspiredBy`). A refused write shows the service's
 * words; a write that went through reads the idea again.
 *
 * Where it leads is declared (epic qits-2000): the enabling idea (`open-enabling-idea` `open`), an
 * idea it enables (`open-enabled-idea` `open`), a work item it inspired (`open-inspired-work`
 * `open`), Edit (`open-idea-edit` `open`), and Create epic / Create ticket (`create-work-from-idea`
 * `epic` / `ticket`, the form's query naming the archetype, the idea's title and description and
 * the idea as `inspiredBy`).
 *
 * Staleness (qits-1270): `IDEA_EVENTS` whose `projectId` is the open project → this idea
 * (`IdeasStore.refreshIdea`, through `IdeasStore.follow`): any of the project's ideas can be the
 * one enabling it or one it enables, and its own status follows its work as an `IdeaUpdated`.
 */
@Component({
  selector: 'app-idea-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, LoadFailure, Markdown, PageLayoutComponent, QitsExit, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [actions]="actions()">
        @if (archiving()) {
          <div
            class="mb-6 flex flex-col gap-3 rounded-md border border-danger-line bg-danger-soft p-4"
            role="group"
            aria-label="Archive the idea"
          >
            <label class="flex flex-col gap-1 text-sm text-fg">
              Why is it archived?
              <textarea
                class="min-h-16 w-full rounded-md border border-line-strong p-2 text-sm"
                aria-label="Reason"
                [value]="reason()"
                (input)="reason.set(text($event))"
              ></textarea>
            </label>
            <div class="flex justify-end gap-2">
              <ui-action-button [action]="cancelArchiveAction()" />
              <ui-action-button [action]="confirmArchiveAction()" />
            </div>
          </div>
        }
        @if (failure(); as failure) {
          <p class="mt-0 mb-4 text-sm text-danger" role="alert">{{ failure }}</p>
        }
        <ui-load-failure
          message="This idea could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          @if (idea(); as idea) {
            <div class="flex flex-col gap-6">
              <div class="flex flex-wrap items-baseline gap-2 text-sm">
                <ui-chip [label]="(idea.status ?? '').toLowerCase()" [tone]="tone(idea.status)" />
                @if (idea.archived) {
                  <ui-chip label="archived" data-archived />
                  @if (idea.archiveReason) {
                    <span class="text-fg-soft">{{ idea.archiveReason }}</span>
                  }
                }
              </div>
              @if (idea.description) {
                <ui-markdown [text]="idea.description" />
              } @else {
                <p class="m-0 text-sm text-fg-muted">No description.</p>
              }
              <section aria-label="Enabled by" class="text-sm text-fg">
                <h2 class="mt-0 mb-1 text-sm font-semibold">Enabled by</h2>
                @if (idea.enabledByIdea; as enabler) {
                  <a
                    class="text-accent no-underline hover:underline"
                    [qitsExit]="enabling.open"
                    [exitParams]="{ slug: slug(), ideaId: enabler.id ?? '' }"
                    >{{ enabler.title }}</a
                  >
                  @if (enabler.archived) {
                    <span class="ml-2 text-warning" data-enabler-archived
                      >That idea is archived.</span
                    >
                  }
                } @else {
                  <span class="text-fg-muted">No idea.</span>
                }
              </section>
              <section aria-label="Enables" class="text-sm text-fg">
                <h2 class="mt-0 mb-1 text-sm font-semibold">Enables</h2>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (enabled of idea.enables ?? []; track enabled.id) {
                    <li class="flex flex-wrap items-baseline gap-2">
                      <ui-chip
                        [label]="(enabled.status ?? '').toLowerCase()"
                        [tone]="tone(enabled.status)"
                      />
                      @if (enabled.archived) {
                        <ui-chip label="archived" />
                      }
                      <a
                        class="text-accent no-underline hover:underline"
                        [qitsExit]="enabledIdeas.open"
                        [exitParams]="{ slug: slug(), ideaId: enabled.id ?? '' }"
                        >{{ enabled.title }}</a
                      >
                    </li>
                  } @empty {
                    <li class="text-fg-muted">No idea.</li>
                  }
                </ul>
              </section>
              <section aria-label="Inspired work" class="text-sm text-fg">
                <h2 class="mt-0 mb-1 text-sm font-semibold">Inspired work</h2>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (work of idea.inspired ?? []; track work.id) {
                    <li class="flex flex-wrap items-baseline gap-2">
                      <a
                        class="font-mono whitespace-nowrap text-accent no-underline hover:underline"
                        [qitsExit]="inspiredWork.open"
                        [exitParams]="{ slug: slug(), id: work.qualifiedId ?? '' }"
                        data-work-item
                        >{{ work.qualifiedId }}</a
                      >
                      <span class="text-fg-muted"
                        >{{ (work.archetype ?? '').toLowerCase() }} ·
                        {{ (work.status ?? '').toLowerCase() }}</span
                      >
                      <span>{{ work.title }}</span>
                    </li>
                  } @empty {
                    <li class="text-fg-muted">No work names this idea yet.</li>
                  }
                </ul>
              </section>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class IdeaPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(IdeasStore);

  /** The "Enabled by" link: the idea enabling this one. */
  protected readonly enabling = outcomes('open-enabling-idea', {
    open: exit('projects/:slug/ideas/detail/:ideaId'),
  });
  /** An idea under "Enables": that idea's page. */
  protected readonly enabledIdeas = outcomes('open-enabled-idea', {
    open: exit('projects/:slug/ideas/detail/:ideaId'),
  });
  /** A work item under "Inspired work": the item's page. */
  protected readonly inspiredWork = outcomes('open-inspired-work', {
    open: exit('projects/:slug/work/detail/:id'),
  });
  /** Edit: the idea's edit form. */
  private readonly editing = outcomes('open-idea-edit', {
    open: exit('projects/:slug/ideas/detail/:ideaId/edit'),
  });
  /** Create epic, Create ticket: the work create form, filled with the idea. */
  private readonly creatingWork = outcomes('create-work-from-idea', {
    epic: exit('projects/:slug/work/create'),
    ticket: exit('projects/:slug/work/create'),
  });

  /** The idea id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('ideaId') ?? '')),
    { initialValue: '' },
  );

  private readonly view = computed(() => this.store.ideaOf(this.id()));
  protected readonly idea = computed(() => this.view()?.idea);

  protected readonly state = computed((): LoadState => {
    const status = this.view()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected readonly title = computed(() => this.idea()?.title ?? 'Idea');
  protected readonly tone = ideaStatusTone;

  protected readonly archiving = signal(false);
  protected readonly reason = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  protected readonly actions = computed((): readonly Action[] => {
    const idea = this.idea();
    if (!idea) return [];
    const busy = this.writing();
    return [
      {
        label: 'Create epic',
        variant: 'muted',
        disabled: busy,
        callback: () => this.createWork('EPIC'),
        outcomes: [this.creatingWork.epic],
      },
      {
        label: 'Create ticket',
        variant: 'muted',
        disabled: busy,
        callback: () => this.createWork('TICKET'),
        outcomes: [this.creatingWork.ticket],
      },
      {
        label: 'Edit',
        variant: 'muted',
        disabled: busy,
        callback: () => void this.editing.open.go({ slug: this.slug(), ideaId: this.id() }),
        outcomes: [this.editing.open],
      },
      idea.archived
        ? {
            label: busy ? 'Unarchiving…' : 'Unarchive',
            variant: 'success',
            disabled: busy,
            callback: () => void this.unarchive(),
          }
        : {
            label: 'Archive',
            variant: 'danger',
            disabled: busy || this.archiving(),
            callback: () => this.openArchive(),
          },
    ];
  });

  protected readonly confirmArchiveAction = computed((): Action => ({
    label: this.writing() ? 'Archiving…' : 'Confirm archive',
    variant: 'danger',
    disabled: this.writing() || !this.reason().trim(),
    callback: () => void this.archive(),
  }));

  protected readonly cancelArchiveAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.archiving.set(false),
  }));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.id();
      if (id) untracked(() => void this.store.loadIdea(id));
    });
    this.store.follow(
      inject(DestroyRef),
      () => this.selected.project()?.id,
      () => {
        const id = this.id();
        if (id) void this.store.refreshIdea(id);
      },
    );
  }

  protected text(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected retry(): void {
    const id = this.id();
    if (id) void this.store.loadIdea(id);
  }

  /** The work create form, filled with the idea and naming it as the inspiration. */
  private createWork(archetype: 'EPIC' | 'TICKET'): void {
    const idea = this.idea();
    if (!idea) return;
    const exit = archetype === 'EPIC' ? this.creatingWork.epic : this.creatingWork.ticket;
    void exit.go(
      { slug: this.slug() },
      {
        queryParams: {
          archetype,
          title: idea.title ?? '',
          description: idea.description ?? '',
          inspiredBy: this.id(),
        },
      },
    );
  }

  private openArchive(): void {
    this.failure.set(null);
    this.reason.set('');
    this.archiving.set(true);
  }

  private async archive(): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await this.store.archive(this.id(), this.reason());
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.archiving.set(false);
    await this.store.refreshIdea(this.id());
  }

  private async unarchive(): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await this.store.unarchive(this.id());
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    await this.store.refreshIdea(this.id());
  }
}
