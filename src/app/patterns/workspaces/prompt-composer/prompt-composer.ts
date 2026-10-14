import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { AgentChatStore } from '$core/workspaces/agent-chat.store';
import { AgentPromptStore } from '$core/workspaces/agent-prompt.store';
import { relativeSince } from '$core/workspaces/agent-labels';
import {
  PickedContext,
  referenceLabel,
  referenceText,
  serializePrompt,
  type CodeReference,
} from '$core/workspaces/picked-context';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import { ActionButton } from '$ui/components/action-button/action-button';
import type { Action } from '$ui/components/action-button/action';

/** How long typing has to stop before the draft is saved. */
export const DRAFT_DEBOUNCE_MS = 750;

/** Where the draft is: as saved, waiting for the debounce, being written, or failed to save. */
type SaveState = 'clean' | 'pending' | 'saving' | 'dirty';

/** What became of a delivered prompt, in words. */
export function deliveryNote(delivery: AgentDelivery): string {
  if (delivery.resumed) return 'Sent. The agent resumes to hear it.';
  if (delivery.launched) return 'Sent. The agent hears it as its first turn, once it starts.';
  if (delivery.delivered) return 'Sent. The agent hears it at its next turn boundary.';
  return (
    delivery.detail?.trim() || 'The service took the message but did not say what became of it.'
  );
}

/** A failed call's status, as the problem line says it. */
const why = (status: number) => (status ? `the service answered ${status}` : 'no answer');

/**
 * Compose the next thing to tell the agent (epic qits-1230), ported from qits-workspaces-frontend's
 * prompt panel without its speech input.
 *
 * - **The prompt box is the draft.** It is restored from the service when the tab opens
 *   (`AgentPromptStore.readDraft`; none is a 404, not an empty box), saved after typing stops for
 *   {@link DRAFT_DEBOUNCE_MS}, and so survives a reload. A failed save marks it unsaved and the next
 *   edit retries. A restored draft says so, with a Discard.
 * - **Rough notes are scratch, not the draft.** "Refine into prompt" rewrites them through the
 *   harness in the agent's container (`AgentChatStore.refine`, with what the work is about), "Use
 *   as-is" takes them unchanged; either appends to the prompt and empties the notes. Without a
 *   container (a queued agent) there is no rewrite.
 * - **Flush, then send.** The draft is written first and a failed write stops the send; the prompt
 *   goes through the delivery door (`AgentPromptStore.deliver`), which resumes a yielded agent to
 *   hear it. A delivered prompt empties the box and the draft.
 * - **Picked context.** The line ranges picked in the agent's Files tab (`PickedContext`) are listed
 *   under the prompt: pressing one puts its label and lines in the prompt, ↗ opens it in the Files
 *   tab (`openReference`), ✕ drops it. They are saved with the draft (`picked`) and restored from
 *   it, joined by any picked since; the ones never pressed in are appended to what is sent.
 * - **Another device's draft** comes in on the slot's `prompt-draft` hint (`WorkspaceHints`, when
 *   the page provides it): adopted only when nothing here is unsaved, and never this tab's own echo
 *   (the `updatedAt` its save answered).
 *
 * In the browser only.
 */
@Component({
  selector: 'app-prompt-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flex flex-col gap-3' },
  template: `
    @if (restoredAt(); as at) {
      <p class="m-0 flex items-center gap-3 text-sm text-charcoal-brown-600" role="status">
        Restored draft from {{ ago(at) }}
        <ui-action-button [action]="discardAction()" />
      </p>
    }

    <section class="flex flex-col gap-2" aria-label="Rough notes">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-semibold text-charcoal-brown-700">Rough notes</span>
        <textarea
          class="rounded-md border border-charcoal-brown-300 bg-white px-2 py-1.5 font-sans text-sm text-charcoal-brown-900"
          rows="3"
          placeholder="Rough words; refine them into a prompt, or use them as they are."
          [value]="notes()"
          (input)="notes.set($any($event.target).value)"
        ></textarea>
      </label>
      @if (canPromote()) {
        <div class="flex flex-wrap items-center gap-2">
          @if (workspaceRowId() > 0) {
            <ui-action-button [action]="refineAction()" />
          }
          <ui-action-button [action]="asIsAction()" />
        </div>
      }
      @if (refineProblem(); as problem) {
        <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ problem }}</p>
      }
    </section>

    <label class="flex flex-col gap-1 text-sm">
      <span class="font-semibold text-charcoal-brown-700">The prompt</span>
      <textarea
        class="rounded-md border border-charcoal-brown-300 bg-white px-2 py-1.5 font-sans text-sm text-charcoal-brown-900"
        rows="6"
        placeholder="Tell the agent what to do next."
        [value]="text()"
        (input)="onType($any($event.target).value)"
      ></textarea>
    </label>

    @if (picked.any()) {
      <section class="flex flex-col gap-1.5 text-sm" aria-label="Picked context">
        <h3 class="m-0 text-sm font-semibold text-charcoal-brown-700">Picked context</h3>
        <p class="m-0 text-xs text-charcoal-brown-600">
          Press a row to put it in the prompt. Anything left unpressed is appended when it is sent.
        </p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          @for (reference of picked.references(); track label(reference)) {
            <li class="flex items-start gap-1.5">
              <button
                type="button"
                class="flex min-w-0 grow cursor-pointer flex-col items-start gap-0.5 rounded-md border border-charcoal-brown-200 bg-white px-2 py-1 text-left font-sans text-xs hover:border-ocean-deep-400"
                (click)="insert(reference)"
              >
                <code class="font-mono text-ocean-deep-800">{{ label(reference) }}</code>
                <span class="w-full truncate font-mono text-charcoal-brown-600">{{
                  reference.excerpt
                }}</span>
              </button>
              <button
                type="button"
                class="cursor-pointer rounded border border-charcoal-brown-200 bg-white px-1.5 py-0.5 text-xs text-charcoal-brown-600"
                [attr.aria-label]="'Open ' + label(reference)"
                title="Open these lines in the Files tab"
                (click)="openReference.emit(reference)"
              >
                ↗
              </button>
              <button
                type="button"
                class="cursor-pointer rounded border border-charcoal-brown-200 bg-white px-1.5 py-0.5 text-xs text-charcoal-brown-600"
                [attr.aria-label]="'Remove ' + label(reference)"
                (click)="drop(reference)"
              >
                ✕
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <div class="flex items-center gap-3">
      <ui-action-button [action]="sendAction()" />
      <span class="text-sm text-charcoal-brown-600">{{ saveLabel() }}</span>
    </div>

    @if (saveProblem(); as problem) {
      <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ problem }}</p>
    }
    @if (sendProblem(); as problem) {
      <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ problem }}</p>
    }
  `,
})
export class PromptComposer {
  private readonly prompts = inject(AgentPromptStore);
  private readonly chats = inject(AgentChatStore);
  private readonly hints = inject(WorkspaceHints, { optional: true });
  protected readonly picked = inject(PickedContext);

  /** Whose draft this is. */
  readonly agentId = input.required<string>();

  /** The agent's work item, which the delivery door is keyed by. */
  readonly workId = input.required<string>();

  /** The agent's slot, for the rewrite; 0 while the agent is queued: no rewrite then. */
  readonly workspaceRowId = input(0);

  /** What the work is about, for the rewrite. */
  readonly preamble = input<string | null>(null);

  /** A prompt was delivered. */
  readonly sent = output<AgentDelivery>();

  /** A picked reference's ↗: open its lines in the Files tab. */
  readonly openReference = output<CodeReference>();

  /** The prompt box: the draft. */
  protected readonly text = signal('');

  /** Rough notes: scratch, never saved. */
  protected readonly notes = signal('');

  protected readonly save = signal<SaveState>('clean');
  protected readonly saveProblem = signal<string | null>(null);
  /** When the draft found on opening was written; cleared by the first edit. */
  protected readonly restoredAt = signal<string | null>(null);
  protected readonly refining = signal(false);
  protected readonly refineProblem = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly sendProblem = signal<string | null>(null);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The `updatedAt` this tab last wrote or read: the `prompt-draft` hint's own echo. */
  private lastWrittenAt: string | null = null;
  private loadedFor = '';

  protected readonly canPromote = computed(
    () => this.notes().trim().length > 0 && !this.refining(),
  );

  protected readonly saveLabel = computed(() => {
    switch (this.save()) {
      case 'pending':
        return 'Not saved yet';
      case 'saving':
        return 'Saving…';
      case 'dirty':
        return 'Not saved: the next edit retries';
      default:
        return '';
    }
  });

  /** What the agent is handed: the prompt, and the picks never pressed into it. */
  private readonly composed = computed(() =>
    serializePrompt({ text: this.text(), picked: this.picked.references() }).trim(),
  );

  protected readonly sendAction = computed((): Action => ({
    label: this.sending() ? 'Sending…' : 'Send to the agent',
    variant: 'success',
    disabled: !this.composed() || this.sending(),
    callback: () => void this.send(),
  }));

  protected readonly discardAction = computed((): Action => ({
    label: 'Discard',
    variant: 'muted',
    callback: () => void this.discard(),
  }));

  protected readonly refineAction = computed((): Action => ({
    label: this.refining() ? 'Refining…' : 'Refine into prompt',
    variant: 'muted',
    disabled: this.refining(),
    callback: () => void this.refine(),
  }));

  protected readonly asIsAction = computed((): Action => ({
    label: 'Use as-is',
    variant: 'muted',
    callback: () => this.useAsIs(),
  }));

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const agentId = this.agentId();
      untracked(() => {
        this.picked.use(agentId);
        if (this.loadedFor === agentId) return;
        this.loadedFor = agentId;
        void this.restore(agentId);
      });
    });
    const hints = this.hints?.hints('prompt-draft');
    if (hints) {
      // The counter's movement is the signal; its first value is the restore above.
      let seen = -1;
      effect(() => {
        const hint = hints();
        untracked(() => {
          if (seen >= 0 && hint !== seen) void this.reconcile(this.agentId());
          seen = hint;
        });
      });
    }
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  protected ago(iso: string): string {
    return relativeSince(iso);
  }

  protected label(reference: CodeReference): string {
    return referenceLabel(reference);
  }

  /** Put a picked reference in the prompt: its label, then its lines, fenced. */
  protected insert(reference: CodeReference): void {
    this.append(referenceText(reference));
  }

  /** Drop a pick; the draft carries the picks, so it is saved again. */
  protected drop(reference: CodeReference): void {
    this.picked.remove(referenceLabel(reference));
    this.restoredAt.set(null);
    this.scheduleSave();
  }

  protected onType(value: string): void {
    this.text.set(value);
    this.restoredAt.set(null);
    this.scheduleSave();
  }

  /** Rewrite the notes into a prompt; the notes stay when the rewrite fails. */
  protected async refine(): Promise<void> {
    const notes = this.notes().trim();
    if (!notes || this.refining()) return;
    this.refining.set(true);
    this.refineProblem.set(null);
    const outcome = await this.chats.refine(this.workspaceRowId(), notes, this.preamble());
    this.refining.set(false);
    if (outcome.ok) this.promote(outcome.value);
    else this.refineProblem.set(`The rewrite did not happen: ${why(outcome.status)}.`);
  }

  protected useAsIs(): void {
    const notes = this.notes().trim();
    if (!notes) return;
    this.refineProblem.set(null);
    this.promote(notes);
  }

  /** Throw the restored draft away. */
  protected async discard(): Promise<void> {
    this.clearTimer();
    this.text.set('');
    this.picked.clear();
    this.restoredAt.set(null);
    this.save.set('clean');
    const outcome = await this.prompts.discardDraft(this.agentId());
    if (outcome.ok) {
      this.lastWrittenAt = null;
      this.saveProblem.set(null);
    } else {
      this.saveProblem.set(`The draft could not be discarded: ${why(outcome.status)}.`);
    }
  }

  /** Write the draft, then send it as the agent's next prompt. */
  protected async send(): Promise<void> {
    const text = this.composed();
    if (!text || this.sending()) return;
    this.sending.set(true);
    this.sendProblem.set(null);
    try {
      if (this.save() !== 'clean') await this.write();
      if (this.save() === 'dirty') {
        this.sendProblem.set('The draft did not save, so nothing was sent. Try again.');
        return;
      }
      const outcome = await this.prompts.deliver(this.workId(), text);
      if (!outcome.ok) {
        this.sendProblem.set(`The message was not sent: ${why(outcome.status)}.`);
        return;
      }
      if (!outcome.value.agentId) {
        this.sendProblem.set('No agent works on this item any more, so nothing was sent.');
        return;
      }
      this.sent.emit(outcome.value);
      this.clearTimer();
      this.text.set('');
      this.picked.clear();
      this.restoredAt.set(null);
      this.save.set('clean');
      // The prompt is said; a stale draft left behind shows as restored next time, never lost.
      if ((await this.prompts.discardDraft(this.agentId())).ok) this.lastWrittenAt = null;
    } finally {
      this.sending.set(false);
    }
  }

  /** Append to the prompt (never replace what was typed), and empty the notes. */
  private promote(prompt: string): void {
    this.append(prompt);
    this.notes.set('');
  }

  /** Append a fragment to the prompt, after a blank line. */
  private append(fragment: string): void {
    const text = fragment.trim();
    this.text.update((current) => (current.trim() ? `${current.trimEnd()}\n\n${text}` : text));
    this.restoredAt.set(null);
    this.scheduleSave();
  }

  private async restore(agentId: string): Promise<void> {
    if (!agentId) return;
    const outcome = await this.prompts.readDraft(agentId);
    if (this.agentId() !== agentId) return;
    if (!outcome.ok) {
      this.saveProblem.set(`The saved draft could not be read: ${why(outcome.status)}.`);
      return;
    }
    // Typed while the read was out: the box wins.
    if (this.save() !== 'clean') return;
    if (!outcome.value) {
      // Picked in the Files tab before there was a draft: the draft starts with them.
      if (this.picked.any()) this.scheduleSave();
      return;
    }
    this.text.set(outcome.value.text);
    this.lastWrittenAt = outcome.value.updatedAt;
    this.restoredAt.set(outcome.value.updatedAt);
    // Picked in the Files tab since the draft was saved: the draft is behind.
    if (this.picked.restore(outcome.value.picked)) this.scheduleSave();
  }

  /** A `prompt-draft` hint: adopt another device's draft when nothing here is unsaved. */
  private async reconcile(agentId: string): Promise<void> {
    if (!agentId || this.save() !== 'clean') return;
    const outcome = await this.prompts.readDraft(agentId);
    if (!outcome.ok || !outcome.value || this.save() !== 'clean') return;
    if (outcome.value.updatedAt === this.lastWrittenAt) return;
    this.text.set(outcome.value.text);
    this.picked.replace(outcome.value.picked);
    this.lastWrittenAt = outcome.value.updatedAt;
    this.restoredAt.set(outcome.value.updatedAt);
  }

  private scheduleSave(): void {
    this.save.set('pending');
    this.clearTimer();
    this.timer = setTimeout(() => void this.write(), DRAFT_DEBOUNCE_MS);
  }

  private async write(): Promise<void> {
    this.clearTimer();
    this.save.set('saving');
    const outcome = await this.prompts.saveDraft(
      this.agentId(),
      this.text(),
      this.picked.references(),
    );
    if (!outcome.ok) {
      this.save.set('dirty');
      this.saveProblem.set(`The draft is not saved: ${why(outcome.status)}.`);
      return;
    }
    this.lastWrittenAt = outcome.value.updatedAt;
    // Typed while the write was out: the next debounce owns it.
    if (this.save() === 'saving') this.save.set('clean');
    this.saveProblem.set(null);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
