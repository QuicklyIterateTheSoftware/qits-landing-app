import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { summarise, TOOL_RESULT_LIMIT, type ChatItem } from '$core/workspaces/chat-model';

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
          <article class="border-l-4 border-ocean-deep-600 pl-3">
            <p class="m-0 mb-0.5 text-xs font-semibold tracking-wide text-ocean-deep-700 uppercase">
              You
            </p>
            <pre
              class="m-0 font-mono text-sm leading-normal wrap-anywhere whitespace-pre-wrap text-charcoal-brown-900"
              >{{ item.text }}</pre>
          </article>
        }
        @case ('assistant') {
          <article class="border-l-4 border-charcoal-brown-200 pl-3">
            <pre
              class="m-0 font-sans text-sm leading-normal wrap-anywhere whitespace-pre-wrap text-charcoal-brown-900"
              >{{ item.text }}</pre>
          </article>
        }
        @case ('thinking') {
          <details class="rounded-md border border-violet-200 bg-violet-50 px-2 py-1">
            <summary class="cursor-pointer text-xs text-charcoal-brown-600">Thinking</summary>
            <pre
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-charcoal-brown-800"
              >{{ item.text }}</pre>
          </details>
        }
        @case ('tool-call') {
          <details
            class="rounded-md border border-charcoal-brown-200 bg-charcoal-brown-50 px-2 py-1"
          >
            <summary class="cursor-pointer truncate text-xs text-charcoal-brown-600">
              <span class="font-semibold text-charcoal-brown-800">{{ item.name }}</span>
              <span class="ml-2 font-mono">{{ brief(item.input) }}</span>
            </summary>
            <pre
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-charcoal-brown-800"
              >{{ item.input }}</pre>
          </details>
        }
        @case ('tool-result') {
          <details
            class="rounded-md border px-2 py-1"
            [class.border-charcoal-brown-200]="!item.isError"
            [class.bg-charcoal-brown-50]="!item.isError"
            [class.border-cinnabar-200]="item.isError"
            [class.bg-cinnabar-50]="item.isError"
          >
            <summary class="cursor-pointer text-xs text-charcoal-brown-600">
              {{ item.isError ? 'Tool failed' : 'Tool result' }}
            </summary>
            <pre
              class="m-0 mt-1 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap text-charcoal-brown-800"
              >{{ item.text }}</pre>
            @if (item.truncatedFrom) {
              <p class="m-0 mt-1 text-xs text-charcoal-brown-600 italic">
                Shown to {{ limit }} characters of {{ item.truncatedFrom }}: the rest is in the
                command’s log.
              </p>
            }
          </details>
        }
        @case ('error') {
          <p class="m-0 rounded-md bg-cinnabar-50 px-2 py-1 text-sm text-cinnabar-700" role="alert">
            {{ item.text }}
          </p>
        }
        @case ('side-chain') {
          <details
            class="rounded-md border border-charcoal-brown-300 bg-charcoal-brown-100 px-2 py-1"
            [class.border-dashed]="!item.anchored"
          >
            <summary class="cursor-pointer truncate text-xs text-charcoal-brown-600">
              <span class="font-semibold text-charcoal-brown-800"
                >Sub-agent{{ item.agentType ? ': ' + item.agentType : '' }}</span
              >
              @if (item.description) {
                <span class="ml-2 font-mono">{{ item.description }}</span>
              }
            </summary>
            @if (!item.anchored) {
              <p class="m-0 mt-1 text-xs text-charcoal-brown-600 italic">
                The tool call that started this one is no longer in the conversation, so it is shown
                here rather than in its place.
              </p>
            }
            <app-conversation class="mt-1" [items]="item.items" />
          </details>
        }
      }
    }
  `,
})
export class Conversation {
  readonly items = input.required<readonly ChatItem[]>();

  protected readonly limit = TOOL_RESULT_LIMIT;

  protected brief(input: string): string {
    return summarise(input);
  }
}
