import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { summarise, TOOL_RESULT_LIMIT, type ChatItem } from '$core/workspaces/chat-model';
import type { ValueMarks } from '$ui/dom/value-marks';

/**
 * An agent's conversation, drawn (epic qits-1230), ported from qits-workspaces-frontend: the items
 * `buildConversation` made of the harness's lines. Each kind gets the attention it wants: the
 * person's turns and the agent's text are open, thinking, tool calls, tool results and a
 * sub-agent's side-chain are folded (`<details>`), an error cannot be missed. Plain text, never
 * markdown, so the pane never says more than the agent did.
 *
 * A side-chain's items are the same kinds, so the template renders itself; it ends, as
 * `buildConversation` never nests a side-chain in another.
 */
@Component({
  selector: 'app-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [forwardRef(() => Conversation)],
  host: { class: 'flex flex-col gap-2' },
  template: `
    @for (item of items(); track $index) {
      @switch (item.kind) {
        @case ('user') {
          <article class="border-l-4 border-accent pl-3">
            <p class="m-0 mb-0.5 text-xs font-semibold tracking-wide text-accent uppercase">You</p>
            <pre
              [attr.data-qits-derived]="marks()?.derived"
              class="m-0 font-mono text-sm leading-normal wrap-anywhere whitespace-pre-wrap text-fg"
              >{{ item.text }}</pre>
          </article>
        }
        @case ('assistant') {
          <article class="border-l-4 border-line pl-3">
            <pre
              [attr.data-qits-derived]="marks()?.derived"
              class="m-0 font-sans text-sm leading-normal wrap-anywhere whitespace-pre-wrap text-fg"
              >{{ item.text }}</pre>
          </article>
        }
        @case ('thinking') {
          <details class="rounded-md border border-special-line bg-special-soft px-2 py-1">
            <summary class="cursor-pointer text-xs text-fg-soft">Thinking</summary>
            <pre
              [attr.data-qits-derived]="marks()?.derived"
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-fg"
              >{{ item.text }}</pre>
          </details>
        }
        @case ('tool-call') {
          <details class="rounded-md border border-line bg-surface-subtle px-2 py-1">
            <summary class="cursor-pointer truncate text-xs text-fg-soft">
              <span class="font-semibold text-fg" [attr.data-qits-derived]="marks()?.derived">{{
                item.name
              }}</span>
              <span class="ml-2 font-mono" [attr.data-qits-derived]="marks()?.derived">{{
                brief(item.input)
              }}</span>
            </summary>
            <pre
              [attr.data-qits-derived]="marks()?.derived"
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-fg"
              >{{ item.input }}</pre>
          </details>
        }
        @case ('tool-result') {
          <details
            class="rounded-md border px-2 py-1"
            [class.border-line]="!item.isError"
            [class.bg-surface-subtle]="!item.isError"
            [class.border-danger-line]="item.isError"
            [class.bg-danger-soft]="item.isError"
          >
            <summary class="cursor-pointer text-xs text-fg-soft">
              {{ item.isError ? 'Tool failed' : 'Tool result' }}
            </summary>
            <pre
              [attr.data-qits-derived]="marks()?.derived"
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-fg"
              >{{ item.text }}</pre>
            @if (item.truncatedFrom) {
              <p
                class="m-0 mt-1 text-xs text-fg-soft italic"
                [attr.data-qits-derived]="marks()?.derived"
              >
                Shown to {{ limit }} characters of {{ item.truncatedFrom }}: the rest is in the
                command’s log.
              </p>
            }
          </details>
        }
        @case ('error') {
          <p
            class="m-0 rounded-md bg-danger-soft px-2 py-1 text-sm text-danger-strong"
            role="alert"
            [attr.data-qits-derived]="marks()?.derived"
          >
            {{ item.text }}
          </p>
        }
        @case ('side-chain') {
          <details
            class="rounded-md border border-line-strong bg-surface-muted px-2 py-1"
            [class.border-dashed]="!item.anchored"
          >
            <summary class="cursor-pointer truncate text-xs text-fg-soft">
              <span class="font-semibold text-fg" [attr.data-qits-derived]="marks()?.derived"
                >Sub-agent{{ item.agentType ? ': ' + item.agentType : '' }}</span
              >
              @if (item.description) {
                <span class="ml-2 font-mono" [attr.data-qits-derived]="marks()?.derived">{{
                  item.description
                }}</span>
              }
            </summary>
            @if (!item.anchored) {
              <p class="m-0 mt-1 text-xs text-fg-soft italic">
                The tool call that started this one is no longer in the conversation, so it is shown
                here rather than in its place.
              </p>
            }
            <app-conversation class="mt-1" [items]="item.items" [marks]="marks()" />
          </details>
        }
      }
    }
  `,
})
export class Conversation {
  readonly items = input.required<readonly ChatItem[]>();
  /**
   * The data marks of what the items show (qits-2146): they are made of the harness's lines, so
   * every value the conversation draws is derived from them; the page names the fields
   * (`derived`), set on each value as is, never on the words around it.
   */
  readonly marks = input<ValueMarks | undefined>(undefined);

  protected readonly limit = TOOL_RESULT_LIMIT;

  protected brief(input: string): string {
    return summarise(input);
  }
}
