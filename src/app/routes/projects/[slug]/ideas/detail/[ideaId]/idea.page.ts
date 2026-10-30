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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ideaPath, ideaStatusTone } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { SelectedProject } from '$core/projects/selected-project';
import { workItemPath } from '$core/workspaces/agent-attention';
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
 * Staleness (qits-1270): `IDEA_EVENTS` whose `projectId` is the open project → this idea
 * (`IdeasStore.refreshIdea`, through `IdeasStore.follow`): any of the project's ideas can be the
 * one enabling it or one it enables, and its own status follows its work as an `IdeaUpdated`.
 */
@Component({
  selector: 'app-idea-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, LoadFailure, Markdown, PageLayoutComponent, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [actions]="actions()">
        @if (archiving()) {
          <div
            class="mb-6 flex flex-col gap-3 rounded-md border border-cinnabar-200 bg-cinnabar-50 p-4"
            role="group"
            aria-label="Archive the idea"
          >
            <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
              Why is it archived?
              <textarea
                class="min-h-16 w-full rounded-md border border-charcoal-brown-300 p-2 text-sm"
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
          <p class="mt-0 mb-4 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
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
                    <span class="text-charcoal-brown-600">{{ idea.archiveReason }}</span>
                  }
                }
              </div>
              @if (idea.description) {
                <ui-markdown [text]="idea.description" />
              } @else {
                <p class="m-0 text-sm text-charcoal-brown-500">No description.</p>
              }
              <section aria-label="Enabled by" class="text-sm text-charcoal-brown-800">
                <h2 class="mt-0 mb-1 text-sm font-semibold">Enabled by</h2>
                @if (idea.enabledByIdea; as enabler) {
                  <a
                    class="text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="ideaLink(enabler.id ?? '')"
                    >{{ enabler.title }}</a
                  >
                  @if (enabler.archived) {
                    <span class="ml-2 text-sunflower-gold-800" data-enabler-archived
                      >That idea is archived.</span
                    >
                  }
                } @else if (idea.enabledBy) {
                  <a
                    class="text-ocean-deep-700 no-underline hover:underline"
                    [routerLink]="ideaLink(idea.enabledBy)"
                    >{{ idea.enabledBy }}</a
                  >
                } @else {
                  <span class="text-charcoal-brown-500">No idea.</span>
                }
              </section>
              <section aria-label="Enables" class="text-sm text-charcoal-brown-800">
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
                        class="text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="ideaLink(enabled.id ?? '')"
                        >{{ enabled.title }}</a
                      >
                    </li>
                  } @empty {
                    <li class="text-charcoal-brown-500">No idea.</li>
                  }
                </ul>
              </section>
              <section aria-label="Inspired work" class="text-sm text-charcoal-brown-800">
                <h2 class="mt-0 mb-1 text-sm font-semibold">Inspired work</h2>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (work of idea.inspired ?? []; track work.id) {
                    <li class="flex flex-wrap items-baseline gap-2">
                      <a
                        class="font-mono whitespace-nowrap text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="workLink(work.qualifiedId ?? '')"
                        data-work-item
                        >{{ work.qualifiedId }}</a
                      >
                      <span class="text-charcoal-brown-500"
                        >{{ (work.archetype ?? '').toLowerCase() }} ·
                        {{ (work.status ?? '').toLowerCase() }}</span
                      >
                      <span>{{ work.title }}</span>
                    </li>
                  } @empty {
                    <li class="text-charcoal-brown-500">No work names this idea yet.</li>
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
  private readonly router = inject(Router);

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

  private readonly slug = computed(() => this.selected.slug() ?? '');

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
      },
      {
        label: 'Create ticket',
        variant: 'muted',
        disabled: busy,
        callback: () => this.createWork('TICKET'),
      },
      {
        label: 'Edit',
        variant: 'muted',
        disabled: busy,
        callback: () => void this.router.navigateByUrl(`${ideaPath(this.slug(), this.id())}/edit`),
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

  protected ideaLink(ideaId: string): string {
    return ideaPath(this.slug(), ideaId);
  }

  protected workLink(qualifiedId: string): string {
    return workItemPath(this.slug(), qualifiedId);
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
    void this.router.navigate(['/projects', this.slug(), 'work', 'create'], {
      queryParams: {
        archetype,
        title: idea.title ?? '',
        description: idea.description ?? '',
        inspiredBy: this.id(),
      },
    });
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
