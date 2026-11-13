import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
} from '@qits/angular';
import {
  aboutProjectIdeas,
  IDEA_EVENTS,
  IDEA_STATUSES,
  type IdeaStatus,
} from '$core/ideas/idea-events';
import { ideaStatusTone } from '$core/ideas/idea-path';
import { inIdeaRank, rankableIdea } from '$core/ideas/idea-rank';
import {
  ideaRefusal,
  ideaRunRefusal,
  reprioritizeIdeaParams,
  withPriorities,
} from '$core/ideas/idea-writes';
import { IDEA_LIST, REPRIORITIZE } from '$core/ideas/ideas.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import {
  reorderAnchor,
  type ReorderAnchor,
  type ReorderIndexMove,
} from '$core/reorder/reorder-anchor';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { Chip } from '$ui/components/chip/chip';
import { DragHandle } from '$ui/components/drag-handle/drag-handle';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { ReorderItem, ReorderList } from '$ui/components/reorder/reorder';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The open project's ideas (epic qits-888), at `/projects/<slug>/ideas`: short, titled notes any
 * work item can name as its inspiration. Each row links the idea's page
 * (`ideas/detail/<id>`) and shows its derived status (PLANNED, QUEUED, DONE) and, with "Show
 * archived" on, whether it is archived. The status filter narrows the answer in the page; "Show
 * archived" reads the list with the archived ones (`IDEA_LIST` with `archived=true`). New
 * idea opens the form (`ideas/create`). A read that fails says so, with Retry.
 *
 * The list is in rank order (`byIdeaRank`, qits-1791) and is a reorder list (`uiReorderList`): a
 * rankable idea (neither archived nor DONE) has a drag handle ("Move <title>") on its row's
 * bottom-right corner, and a drop is sent as its place among the rankable ideas shown
 * (`reorderAnchor`, `REPRIORITIZE`), so a drop in a status-filtered view lands right. The renumbered
 * ideas it answers are written into the list at once (`withPriorities`), so the idea stays where it
 * was dropped.
 * An archived or DONE idea has no handle and cannot be dragged. A cancelled drag, and a drop where
 * the idea already was, send nothing. A refused drop says why above the list, in the service's
 * words, until the next drop; the list is read again, so the idea goes back.
 *
 * Where it leads is declared (epic qits-2000): an idea's title opens its page (`open-listed-idea`
 * `open`), and New idea opens the form (`open-idea-create` `open`).
 *
 * It reads the open project's ideas through its own `qitsResource` over `IDEA_LIST` (qits-2146), in
 * the browser only (the server render has no session), drops through `qitsMutation(REPRIORITIZE)`,
 * and marks what it shows (qits-2141): the list is that read, each row an idea by its id.
 *
 * Staleness (qits-1270): `IDEA_EVENTS` whose `projectId` is the open project → the list on show
 * (the resource's `refreshOn`, narrowed by `aboutProjectIdeas`, as `IdeasStore.follow` was);
 * another project's events read nothing. Toggling "Show archived" reads the other list afresh.
 */
@Component({
  selector: 'app-project-ideas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Chip,
    DragHandle,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsEntityList,
    QitsExit,
    QitsField,
    ReorderItem,
    ReorderList,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Ideas" [actions]="actions()">
        <div class="mb-4 flex flex-wrap items-center gap-4 text-sm text-fg">
          <div class="flex gap-1" role="group" aria-label="Status">
            @for (option of filters; track option.label) {
              <button
                type="button"
                class="h-7 cursor-pointer rounded-md border px-2 text-xs font-semibold"
                [class]="
                  status() === option.value
                    ? 'border-accent-line bg-accent-soft text-accent'
                    : 'border-line bg-surface text-fg-soft'
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
        <p role="alert" class="m-0 mb-4 text-sm text-danger" [class.hidden]="!refusal()">
          {{ refusal() }}
        </p>
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul
            class="m-0 flex list-none flex-col gap-2 p-0"
            aria-label="Ideas"
            uiReorderList
            reorderLabel="Ideas"
            [qitsEntityList]="ideas"
            (reordered)="move($event)"
          >
            @for (idea of shown(); track idea.id) {
              <li
                class="relative flex flex-wrap items-baseline gap-2 rounded-md border border-line bg-surface px-3 py-2"
                uiReorderItem
                [reorderItemLabel]="idea.title ?? ''"
                [qitsEntity]="idea"
                entityKey="id"
              >
                <ui-chip
                  [label]="(idea.status ?? '').toLowerCase()"
                  [tone]="tone(idea.status)"
                  [fieldOf]="idea"
                  [qitsField]="{ derived: ['status'] }"
                />
                @if (idea.archived) {
                  <ui-chip
                    label="archived"
                    [fieldOf]="idea"
                    [qitsField]="{ derived: ['archived'] }"
                  />
                }
                <a
                  class="font-semibold break-words text-accent no-underline hover:underline"
                  [qitsExit]="listed.open"
                  [exitParams]="{ slug: slug(), ideaId: idea.id ?? '' }"
                  [fieldOf]="idea"
                  qitsField="title"
                  >{{ idea.title }}</a
                >
                <ui-drag-handle
                  [shown]="rankable(idea)"
                  [label]="'Move ' + (idea.title ?? '')"
                  [fieldOf]="idea"
                  [qitsField]="{ derived: ['archived', 'status', 'title'] }"
                />
              </li>
            }
          </ul>
          <p
            class="m-0 px-3 py-8 text-center text-sm text-fg-muted"
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
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** An idea's title: the idea's page. */
  protected readonly listed = outcomes('open-listed-idea', {
    open: exit('projects/:slug/ideas/detail/:ideaId'),
  });
  /** New idea: the idea form. */
  private readonly creating = outcomes('open-idea-create', {
    open: exit('projects/:slug/ideas/create'),
  });

  protected readonly slug = computed(() => this.selected.slug() ?? '');

  protected readonly filters: readonly { label: string; value: IdeaStatus | null }[] = [
    { label: 'All', value: null },
    ...IDEA_STATUSES.map((value) => ({ label: value.toLowerCase(), value })),
  ];

  /** The status the list is narrowed to; null for every status. */
  protected readonly status = signal<IdeaStatus | null>(null);
  /** Whether the archived ideas are listed beside the others. */
  protected readonly archived = signal(false);

  protected readonly tone = ideaStatusTone;
  protected readonly rankable = rankableIdea;

  /** The open project's id, in the browser only: the read waits for it. */
  private readonly projectId = computed(() =>
    this.browser ? this.selected.project()?.id : undefined,
  );

  /** The open project's ideas, with the archived ones when asked; read again on its idea events. */
  protected readonly ideas = qitsResource(
    IDEA_LIST,
    () => {
      const project = this.projectId();
      if (!project) return undefined;
      return { query: this.archived() ? { project, archived: true } : { project } };
    },
    {
      refreshOn: {
        names: IDEA_EVENTS,
        when: (event) => aboutProjectIdeas(event, this.projectId()),
      },
    },
  );

  /** Ranks a dropped idea. */
  private readonly reprioritizing = qitsMutation(REPRIORITIZE);

  protected readonly state = computed((): LoadState => loadState(this.ideas));

  /** The read's ideas, in rank order (`byIdeaRank`, qits-1791); none until it answered. */
  private readonly ranked = computed(() =>
    inIdeaRank(this.ideas.hasValue() ? (this.ideas.value()?.ideas ?? []) : []),
  );

  protected readonly shown = computed(() => {
    const status = this.status();
    const ideas = this.ranked();
    return status ? ideas.filter((idea) => idea.status === status) : ideas;
  });

  /** Why the last drop was refused, in the service's words; gone when the next one starts. */
  protected readonly refusal = signal<string | undefined>(undefined);

  protected readonly emptyText = computed(() =>
    this.status() ? `No ${this.status()?.toLowerCase()} ideas.` : 'This project has no ideas yet.',
  );

  protected readonly actions = computed((): readonly Action[] => [
    {
      label: 'New idea',
      variant: 'success',
      callback: () => void this.creating.open.go({ slug: this.slug() }),
      outcomes: [this.creating.open],
    },
  ]);

  /**
   * A drop among the shown ideas, sent as its place among the rankable ones; nothing for an
   * unrankable idea or a drop that leaves the rankable ideas in their order.
   */
  protected move(move: ReorderIndexMove): void {
    const shown = this.shown();
    const ids = shown.map((idea) => idea.id ?? '');
    const rankable = new Set(shown.filter(rankableIdea).map((idea) => idea.id));
    const anchor = reorderAnchor(ids, move, (id) => !!id && rankable.has(id));
    const moved = ids[move.from];
    if (!this.projectId() || !moved || !anchor) return;
    void this.reprioritize(moved, anchor);
  }

  /**
   * Sends a drop; the answer's priorities order the list at once. A refusal reads the list again,
   * so the idea goes back, and is kept until the next drop.
   */
  private async reprioritize(id: string, anchor: ReorderAnchor): Promise<void> {
    this.refusal.set(undefined);
    const refusal = await this.reprioritizing
      .run(reprioritizeIdeaParams(id, anchor))
      .then((priorities) => {
        if (!priorities) return ideaRefusal(undefined, 200);
        this.ideas.update(
          (list) => list && { ...list, ideas: withPriorities(list.ideas ?? [], priorities) },
        );
        return undefined;
      }, ideaRunRefusal);
    if (refusal === undefined) return;
    this.refusal.set(refusal);
    this.ideas.reload();
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected retry(): void {
    this.ideas.reload();
  }
}
