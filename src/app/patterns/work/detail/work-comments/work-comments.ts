import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CommentEntry } from '$core/work/work-detail.consumes';
import { WorkDetailStore } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Markdown } from '$ui/components/markdown/markdown';

/** Which comment write is in flight: `add`, or `save` of an edit. */
type CommentWrite = 'add' | 'save';

/**
 * A work item's comments, oldest first: each with its author, its time (UTC) and its body as
 * Markdown. "No comments yet" for none. A region named "Comments".
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
 * (`WorkDetailStore` puts it in the thread); a refusal (a 403, say) is said below, and the typed
 * text stays.
 */
@Component({
  selector: 'app-work-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, DatePipe, Markdown],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Comments">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Comments</h2>
      <ol class="m-0 flex list-none flex-col gap-3 p-0">
        @for (comment of comments(); track comment.id) {
          <li class="rounded-md border border-charcoal-brown-200 px-4 py-3">
            <div class="mb-1 flex items-start justify-between gap-2">
              <p class="m-0 text-xs text-charcoal-brown-600">
                <span class="font-semibold text-charcoal-brown-900">{{
                  authorLabel(comment)
                }}</span>
                · {{ comment.createdAt | date: 'd MMM y, HH:mm' : 'UTC' }}
              </p>
              @if (editing() !== comment.id && comment.editable) {
                <ui-action-button [action]="editAction(comment)" />
              }
            </div>
            @if (editing() === comment.id) {
              <textarea
                class="block min-h-24 w-full rounded-md border border-charcoal-brown-300 px-2 py-1.5 text-sm"
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
              <ui-markdown [text]="comment.body ?? ''" />
            }
          </li>
        }
      </ol>
      <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="comments().length">
        No comments yet
      </p>
      <div class="flex flex-col gap-2">
        <textarea
          class="block min-h-20 w-full rounded-md border border-charcoal-brown-300 px-2 py-1.5 text-sm"
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
        <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class WorkComments {
  private readonly store = inject(WorkDetailStore);

  readonly comments = input.required<readonly CommentEntry[]>();
  /** The item the thread belongs to: its qualified id addresses the writes. */
  readonly entry = input.required<Pick<WorkEntry, 'qualifiedId' | 'archetype'>>();

  protected readonly composed = signal('');
  /** The comment whose body is open for editing, and its text as typed. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');
  protected readonly writing = signal<CommentWrite | null>(null);
  protected readonly failure = signal<string | null>(null);

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
    const { refusal } = await this.store.addComment(this.entry().qualifiedId ?? '', body);
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
    const { refusal } = await this.store.editComment(
      this.entry().qualifiedId ?? '',
      commentId,
      body,
    );
    this.writing.set(null);
    if (refusal) {
      this.failure.set(`Could not save the comment — ${refusal}.`);
      return;
    }
    this.stopEditing();
  }
}
