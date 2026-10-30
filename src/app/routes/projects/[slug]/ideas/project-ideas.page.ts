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
import { Router, RouterLink } from '@angular/router';
import { IDEA_STATUSES, type IdeaStatus } from '$core/ideas/idea-events';
import { ideaPath, ideaStatusTone } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The open project's ideas (epic qits-888), at `/projects/<slug>/ideas`: short, titled notes an
 * epic, a ticket or a campaign can name as its inspiration. Each row links the idea's page
 * (`ideas/detail/<id>`) and shows its derived status (PLANNED, QUEUED, DONE) and, with "Show
 * archived" on, whether it is archived. The status filter narrows the answer in the page; "Show
 * archived" reads the list with the archived ones (`IdeasStore.loadList(projectId, true)`). New
 * idea opens the form (`ideas/create`). A read that fails says so, with Retry.
 *
 * Staleness (qits-1270): `IDEA_EVENTS` whose `projectId` is the open project → the list on show
 * (`IdeasStore.refreshList`, through `IdeasStore.follow`); another project's events read nothing.
 */
@Component({
  selector: 'app-project-ideas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, LoadFailure, PageLayoutComponent, RouterLink, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Ideas" [actions]="actions()">
        <div class="mb-4 flex flex-wrap items-center gap-4 text-sm text-charcoal-brown-800">
          <div class="flex gap-1" role="group" aria-label="Status">
            @for (option of filters; track option.label) {
              <button
                type="button"
                class="h-7 cursor-pointer rounded-md border px-2 text-xs font-semibold"
                [class]="
                  status() === option.value
                    ? 'border-ocean-deep-600 bg-ocean-deep-50 text-ocean-deep-800'
                    : 'border-charcoal-brown-200 bg-white text-charcoal-brown-700'
                "
                [attr.aria-pressed]="status() === option.value"
                (click)="status.set(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="Show archived"
              [checked]="archived()"
              (change)="archived.set(checked($event))"
            />
            Show archived
          </label>
        </div>
        <ui-load-failure
          message="This project’s ideas could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Ideas">
            @for (idea of shown(); track idea.id) {
              <li
                class="flex flex-wrap items-baseline gap-2 rounded-md border border-gray-200 bg-white px-3 py-2"
              >
                <ui-chip [label]="(idea.status ?? '').toLowerCase()" [tone]="tone(idea.status)" />
                @if (idea.archived) {
                  <ui-chip label="archived" />
                }
                <a
                  class="font-semibold break-words text-ocean-deep-700 no-underline hover:underline"
                  [routerLink]="link(idea.id ?? '')"
                  >{{ idea.title }}</a
                >
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-gray-500"
            [class]="state() === 'loaded' && shown().length === 0 ? 'block' : 'hidden'"
          >
            {{ emptyText() }}
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ProjectIdeasPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(IdeasStore);
  private readonly router = inject(Router);

  protected readonly filters: readonly { label: string; value: IdeaStatus | null }[] = [
    { label: 'All', value: null },
    ...IDEA_STATUSES.map((value) => ({ label: value.toLowerCase(), value })),
  ];

  /** The status the list is narrowed to; null for every status. */
  protected readonly status = signal<IdeaStatus | null>(null);
  /** Whether the archived ideas are listed beside the others. */
  protected readonly archived = signal(false);

  protected readonly tone = ideaStatusTone;

  private readonly projectId = computed(() => this.selected.project()?.id);

  private readonly list = computed(() => {
    const id = this.projectId();
    return id ? this.store.listOf(id, this.archived()) : undefined;
  });

  protected readonly state = computed((): LoadState => {
    const status = this.list()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected readonly shown = computed(() => {
    const status = this.status();
    const ideas = this.list()?.ideas ?? [];
    return status ? ideas.filter((idea) => idea.status === status) : ideas;
  });

  protected readonly emptyText = computed(() =>
    this.status() ? `No ${this.status()?.toLowerCase()} ideas.` : 'This project has no ideas yet.',
  );

  protected readonly actions = computed((): readonly Action[] => [
    {
      label: 'New idea',
      variant: 'success',
      callback: () =>
        void this.router.navigateByUrl(`/projects/${this.selected.slug() ?? ''}/ideas/create`),
    },
  ]);

  protected link(ideaId: string): string {
    return ideaPath(this.selected.slug() ?? '', ideaId);
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected retry(): void {
    const id = this.projectId();
    if (id) void this.store.loadList(id, this.archived());
  }

  constructor() {
    // In the browser only (the server render has no session cookie).
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.projectId();
      const archived = this.archived();
      if (!id) return;
      // Read once, and again on coming back to it: a list toggled away from missed its events.
      untracked(() =>
        this.store.listOf(id, archived)?.status === 'loaded'
          ? void this.store.refreshList(id, archived)
          : void this.store.loadList(id, archived),
      );
    });
    this.store.follow(
      inject(DestroyRef),
      () => this.projectId(),
      () => {
        const id = this.projectId();
        if (id) void this.store.refreshList(id, this.archived());
      },
    );
  }
}
