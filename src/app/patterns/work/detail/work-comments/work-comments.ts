import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CommentEntry } from '$core/work/work-detail.consumes';
import { Markdown } from '$ui/components/markdown/markdown';

/**
 * A work item's comments, oldest first: each with its author, its time (UTC) and its body as
 * Markdown. "No comments yet" for none. A region named "Comments".
 */
@Component({
  selector: 'app-work-comments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Markdown],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-label="Comments">
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Comments</h2>
      <ol class="m-0 flex list-none flex-col gap-3 p-0">
        @for (comment of comments(); track comment.id) {
          <li class="rounded-md border border-charcoal-brown-200 px-4 py-3">
            <p class="m-0 mb-1 text-xs text-charcoal-brown-600">
              <span class="font-semibold text-charcoal-brown-900">{{ comment.author }}</span>
              · {{ comment.createdAt | date: 'd MMM y, HH:mm' : 'UTC' }}
            </p>
            <ui-markdown [text]="comment.body ?? ''" />
          </li>
        }
      </ol>
      <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="comments().length">
        No comments yet
      </p>
    </section>
  `,
})
export class WorkComments {
  readonly comments = input.required<readonly CommentEntry[]>();
}
