import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { commentAnchor, commentOfAnchor } from '$core/work/comment-anchor';
import {
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsMutation,
  type QitsResourceRef,
} from '@qits/angular';
import type { CommentEntry, WorkThread } from '$core/work/work-detail.consumes';
import {
  commentRefusal,
  commentRunRefusal,
  editCommentParams,
  withComment,
} from '$core/work/work-detail';
import { EDIT_WORK_COMMENT } from '$core/work/work-detail.operations';
import type { WorkEntry } from '$core/work/work.consumes';
import { ADD_WORK_COMMENT } from '$core/work/work.operations';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Markdown } from '$ui/components/markdown/markdown';

/** Which comment write is in flight: `add`, or `save` of an edit. */
type CommentWrite = 'add' | 'save';

/**
 * A work item's comments, oldest first: each with its author, its time (UTC) and its body as
 * Markdown, the work ids of `project` in it drawn as work references with their briefs (qits-1898).
 * "No comments yet" for none. A region named "Comments".
 *
 * Each comment's row has the id `comment-<comment id>` (`commentAnchor`), so a link can open the
 * page at it (qits-1660; the Desk page links each `@desk` comment so). When the URL's fragment
 * names a comment, its row is outlined and scrolled into view once it is drawn. A fragment naming
 * a comment the thread does not hold yet (a thread read before the comment was written) reads the
 * thread again, once.
 *
 * A comment an agent wrote shows "`<authorAgentOf>`'s agent" (the qualified id of the work item
 * whose agent wrote it) in place of its author (qits-1452); a person's shows its author as before.
 * Edit shows only on a comment the caller may edit (`editable`, stamped by qits-projects: only its
 * author may edit it today).
 *
 * Below the thread, a box to comment (Markdown) and Comment; Edit on a comment opens its body in a
 * box with Save and Cancel. Ported from qits-projects-frontend's thread (`entity-thread.ts`), with
 * the same request: only the body travels, the author is the session's. Comment and Save stay
 * disabled while the box is blank or a write is in flight. The answered comment shows at once
 * (written into the thread's read, `withComment`); a refusal (a 403, say) is said below, and the
 * typed text stays. The writes go through `qitsMutation(ADD_WORK_COMMENT)` and
 * `qitsMutation(EDIT_WORK_COMMENT)` (qits-2146); `comments` is the work item page's read of the
 * thread (`WORK_COMMENTS`), and each comment marks itself (`qitsEntity` by `id`) and its fields.
 */
@Component({
  selector: 'app-work-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, DatePipe, Markdown, QitsEntity, QitsEntityList, QitsField],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Comments">
      <h2 class="m-0 text-base font-semibold text-fg">Comments</h2>
      <ol class="m-0 flex list-none flex-col gap-3 p-0" [qitsEntityList]="comments()">
        @for (entry of answer()?.entries ?? []; track entry.comment?.id) {
          @if (entry.comment; as comment) {
            <li
              class="scroll-mt-6 rounded-md border px-4 py-3"
              [class]="
                targeted() === comment.id ? 'border-accent ring-2 ring-accent-soft' : 'border-line'
              "
              [id]="anchor(comment)"
              [qitsEntity]="comment"
              entityKey="id"
            >
              <div class="mb-1 flex items-start justify-between gap-2">
                <p class="m-0 text-xs text-fg-soft">
                  <span
                    class="font-semibold text-fg"
                    [fieldOf]="comment"
                    [qitsField]="{ derived: ['authorAgentOf', 'author'] }"
                    >{{ authorLabel(comment) }}</span
                  >
                  ·
                  <span [fieldOf]="comment" [qitsField]="{ derived: ['createdAt'] }">{{
                    comment.createdAt | date: 'd MMM y, HH:mm' : 'UTC'
                  }}</span>
                </p>
                @if (editing() !== comment.id && comment.editable) {
                  <ui-action-button
                    [fieldOf]="comment"
                    [qitsField]="{ derived: ['editable'] }"
                    [action]="editAction(comment)"
                  />
                }
              </div>
              @if (editing() === comment.id) {
                <textarea
                  class="block min-h-24 w-full rounded-md border border-line-strong px-2 py-1.5 text-sm"
                  rows="4"
                  aria-label="Edit the comment"
                  [value]="draft()"
                  (input)="draft.set(valueOf($event))"
                ></textarea>
                <div class="mt-2 flex justify-end gap-2">
                  <ui-action-button [action]="cancelAction()" />
                  <ui-action-button [action]="saveAction()" />
                </div>
              } @else {
                <ui-markdown
                  [fieldOf]="comment"
                  qitsField="body"
                  [text]="comment.body ?? ''"
                  [workProject]="project()"
                />
              }
            </li>
          }
        }
      </ol>
      <p class="m-0 text-sm text-fg-muted" [class.hidden]="count()">No comments yet</p>
      <div class="flex flex-col gap-2">
        <textarea
          class="block min-h-20 w-full rounded-md border border-line-strong px-2 py-1.5 text-sm"
          rows="3"
          aria-label="Add a comment"
          [placeholder]="placeholder()"
          [value]="composed()"
          (input)="composed.set(valueOf($event))"
        ></textarea>
        <div class="flex justify-end">
          <ui-action-button [action]="commentAction()" />
        </div>
      </div>
      @if (failure(); as failure) {
        <p class="m-0 text-sm text-danger" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkComments {
  private readonly injector = inject(Injector);
  private readonly adding = qitsMutation(ADD_WORK_COMMENT);
  private readonly editingComment = qitsMutation(EDIT_WORK_COMMENT);

  /** The item's thread: the work item page's read (`WORK_COMMENTS`). */
  readonly comments = input.required<QitsResourceRef<WorkThread>>();
  /** The item the thread belongs to: its qualified id addresses the writes. */
  readonly entry = input.required<Pick<WorkEntry, 'qualifiedId' | 'archetype'>>();
  /** The project's slug: the work ids a comment names link with their briefs (qits-1898). */
  readonly project = input<string | undefined>(undefined);

  protected readonly composed = signal('');
  /** The comment whose body is open for editing, and its text as typed. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly writing = signal<CommentWrite | null>(null);
  protected readonly failure = signal<string | null>(null);

  /** The thread's comments, oldest first; none until it is read. */
  /** The thread as read; none until it is in, and after a failed first read. */
  protected readonly answer = computed(() => {
    const read = this.comments();
    return read.hasValue() ? read.value() : undefined;
  });

  private readonly thread = computed((): readonly CommentEntry[] =>
    (this.answer()?.entries ?? []).flatMap((e) => (e.comment ? [e.comment] : [])),
  );

  protected readonly count = computed(() => this.thread().length);

  /** The comment the URL's fragment names (`#comment-<id>`); undefined when it names none. */
  protected readonly targeted = computed(() => commentOfAnchor(this.fragment()));

  private readonly fragment = toSignal(
    inject(ActivatedRoute, { optional: true })?.fragment ?? of(null),
    {
      initialValue: null,
    },
  );

  protected readonly placeholder = computed(
    () => `Say something about this ${(this.entry().archetype ?? 'item').toLowerCase()}.`,
  );

  protected readonly commentAction = computed((): Action => ({
    label: this.writing() === 'add' ? 'Commenting…' : 'Comment',
    variant: 'success',
    disabled: !this.composed().trim() || this.writing() !== null,
    callback: () => void this.add(),
  }));

  protected readonly saveAction = computed((): Action => ({
    label: this.writing() === 'save' ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: !this.draft().trim() || this.writing() !== null,
    callback: () => void this.save(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing() !== null,
    callback: () => this.stopEditing(),
  }));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    let scrolledTo: string | undefined;
    let reread: string | undefined;
    effect(() => {
      const id = this.targeted();
      if (!id || id === scrolledTo) return;
      if (this.thread().some((comment) => comment.id === id)) {
        scrolledTo = id;
        afterNextRender(
          () => document.getElementById(commentAnchor(id))?.scrollIntoView({ block: 'start' }),
          { injector: this.injector },
        );
        return;
      }
      // Only a thread that has loaded can lack it; one still loading is read already.
      const read = this.comments();
      if (reread !== id && read.hasValue() && read.status() !== 'loading') {
        reread = id;
        untracked(() => read.reload());
      }
    });
  }

  /** The row's `id`, which a URL fragment names to open the page at it. */
  protected anchor(comment: CommentEntry): string {
    return commentAnchor(comment.id ?? '');
  }

  /** The byline for `comment`: the work item whose agent wrote it, else its author. */
  protected authorLabel(comment: CommentEntry): string {
    const agentOf = comment.authorAgentOf?.trim();
    return agentOf ? `${agentOf}'s agent` : (comment.author ?? '');
  }

  protected editAction(comment: CommentEntry): Action {
    return {
      label: 'Edit',
      variant: 'muted',
      disabled: this.writing() !== null,
      callback: () => this.startEditing(comment),
    };
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  private startEditing(comment: CommentEntry): void {
    this.draft.set(comment.body ?? '');
    this.failure.set(null);
    this.editing.set(comment.id ?? null);
  }

  private stopEditing(): void {
    this.editing.set(null);
    this.draft.set('');
    this.failure.set(null);
  }

  private async add(): Promise<void> {
    const body = this.composed().trim();
    if (!body || this.writing()) return;
    this.writing.set('add');
    this.failure.set(null);
    const refusal = await this.write(() =>
      this.adding.run({ path: { qualifiedId: this.entry().qualifiedId ?? '' }, body: { body } }),
    );
    this.writing.set(null);
    if (refusal) {
      this.failure.set(`Could not add the comment — ${refusal}.`);
      return;
    }
    this.composed.set('');
  }

  private async save(): Promise<void> {
    const commentId = this.editing();
    const body = this.draft().trim();
    if (!commentId || !body || this.writing()) return;
    this.writing.set('save');
    this.failure.set(null);
    const refusal = await this.write(() =>
      this.editingComment.run(editCommentParams(this.entry().qualifiedId ?? '', commentId, body)),
    );
    this.writing.set(null);
    if (refusal) {
      this.failure.set(`Could not save the comment — ${refusal}.`);
      return;
    }
    this.stopEditing();
  }

  /**
   * Runs a comment write; the answered comment goes into the thread's read (a new one last, an
   * edited one in its place), so it shows without a second read. Why it failed, else nothing.
   */
  private async write(
    run: () => Promise<{ readonly comment?: CommentEntry } | undefined>,
  ): Promise<string | undefined> {
    if (!this.entry().qualifiedId) return 'a comment needs some text';
    try {
      const comment = (await run())?.comment;
      if (!comment) return commentRefusal(undefined, 200);
      this.comments().update((thread) => withComment(thread, comment));
      return undefined;
    } catch (error) {
      return commentRunRefusal(error);
    }
  }
}
