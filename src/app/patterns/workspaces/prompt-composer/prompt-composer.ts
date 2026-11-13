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
import { qitsMutation, qitsResource, QitsTriggers, sourceMark, type Outcome } from '@qits/angular';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { isMissing } from '$core/resources/resource-family';
import type { AgentDelivery } from '$core/workspaces/agent-prompt.consumes';
import { PROMPT_REFINEMENT } from '$core/workspaces/agent-chat.operations';
import {
  AGENT_PROMPT,
  PROMPT_DRAFT,
  PROMPT_DRAFT_DELETE,
  PROMPT_DRAFT_SAVE,
} from '$core/workspaces/agent-prompt.operations';
import { agentRoute } from '$core/workspaces/agent-proxy';
import { relativeSince } from '$core/workspaces/agent-labels';
import {
  promptDraftOf,
  promptParams,
  saveDraftParams,
  type PromptDraft,
} from '$core/workspaces/prompt-drafts';
import { runRefusal } from '$core/workspaces/refusals';
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

/** A failed run's status, as the problem line says it. */
const whyNot = (error: unknown) => why(runRefusal(error).status);

/**
 * Compose the next thing to tell the agent (epic qits-1230), ported from qits-workspaces-frontend's
 * prompt panel without its speech input.
 *
 * - **The prompt box is the draft.** It is restored from the service when the tab opens (its own
 *   `qitsResource` over `PROMPT_DRAFT`, qits-2146; none is a 404, not an empty box), saved after
 *   typing stops for {@link DRAFT_DEBOUNCE_MS} (`qitsMutation(PROMPT_DRAFT_SAVE)`), and so survives
 *   a reload. A failed save marks it unsaved and the next edit retries. A restored draft says so,
 *   with a Discard.
 * - **Rough notes are scratch, not the draft.** "Refine into prompt" rewrites them through the
 *   harness in the agent's container (`qitsMutation(PROMPT_REFINEMENT)`, with what the work is
 *   about), "Use as-is" takes them unchanged; either appends to the prompt and empties the notes.
 *   Without a container (a queued agent) there is no rewrite.
 * - **Flush, then send.** The draft is written first and a failed write stops the send; the prompt
 *   goes to the agent by its id (`qitsMutation(AGENT_PROMPT)`, `promptAgent`), which resumes a
 *   yielded or stopped agent to hear it. A delivered prompt empties the box and the draft.
 * - **Picked context.** The line ranges picked in the agent's Files tab (`PickedContext`) are
 *   listed under the prompt: pressing one puts its label and lines in the prompt, ↗ opens it in the
 *   Files tab (`openReference`), ✕ drops it. They are saved with the draft (`picked`) and restored
 *   from it, joined by any picked since; the ones never pressed in are appended to what is sent.
 * - **Another device's draft** comes in on the slot's `prompt-draft` hint (`WorkspaceHints`, when
 *   the page provides it), which reads the draft again: adopted only when nothing here is unsaved,
 *   and never this tab's own echo (the `updatedAt` its save answered).
 *
 * The restored draft is the person's own text in a box they edit, so it carries no field marks; the
 * restored line and the prompt box name the draft's read as their source (`data-qits-source`,
 * qits-2141), and the restored line's age is marked derived from the draft's `draft.updatedAt`
 * (qits-2146).
 *
 * In the browser only.
 */
@Component({
  selector: 'app-prompt-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, QitsTriggers],
  host: { class: 'flex flex-col gap-3' },
  template: `
    @if (restoredAt(); as at) {
      <p
        class="m-0 flex items-center gap-3 text-sm text-fg-muted"
        role="status"
        [attr.data-qits-source]="draftSource"
      >
        <span data-qits-derived="draft.updatedAt">Restored draft from {{ ago(at) }}</span>
        <ui-action-button [action]="discardAction()" />
      </p>
    }

    <section class="flex flex-col gap-2" aria-label="Rough notes">
      <label class="flex flex-col gap-1 text-sm">
        <span class="font-semibold text-fg-soft">Rough notes</span>
        <textarea
          class="rounded-md border border-line-strong bg-surface px-2 py-1.5 font-sans text-sm text-fg"
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
        <p class="m-0 text-sm text-danger" role="alert">{{ problem }}</p>
      }
    </section>

    <label class="flex flex-col gap-1 text-sm" [attr.data-qits-source]="draftSource">
      <span class="font-semibold text-fg-soft">The prompt</span>
      <textarea
        class="rounded-md border border-line-strong bg-surface px-2 py-1.5 font-sans text-sm text-fg"
        rows="6"
        placeholder="Tell the agent what to do next."
        [value]="text()"
        (input)="onType($any($event.target).value)"
      ></textarea>
    </label>

    @if (picked.any()) {
      <section class="flex flex-col gap-1.5 text-sm" aria-label="Picked context">
        <h3 class="m-0 text-sm font-semibold text-fg-soft">Picked context</h3>
        <p class="m-0 text-xs text-fg-muted">
          Press a row to put it in the prompt. Anything left unpressed is appended when it is sent.
        </p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          @for (reference of picked.references(); track label(reference)) {
            <li class="flex items-start gap-1.5">
              <button
                type="button"
                class="flex min-w-0 grow cursor-pointer flex-col items-start gap-0.5 rounded-md border border-line bg-surface px-2 py-1 text-left font-sans text-xs hover:border-accent-line"
                (click)="insert(reference)"
              >
                <code class="font-mono text-accent">{{ label(reference) }}</code>
                <span class="w-full truncate font-mono text-fg-muted">{{ reference.excerpt }}</span>
              </button>
              <button
                type="button"
                class="cursor-pointer rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-fg-control"
                [attr.aria-label]="'Open ' + label(reference)"
                title="Open these lines in the Files tab"
                [qitsTriggers]="referenceOutcomes()"
                (click)="openReference.emit(reference)"
              >
                ↗
              </button>
              <button
                type="button"
                class="cursor-pointer rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-fg-control"
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
      <span class="text-sm text-fg-muted">{{ saveLabel() }}</span>
    </div>

    @if (saveProblem(); as problem) {
      <p class="m-0 text-sm text-danger" role="alert">{{ problem }}</p>
    }
    @if (sendProblem(); as problem) {
      <p class="m-0 text-sm text-danger" role="alert">{{ problem }}</p>
    }
  `,
})
export class PromptComposer {
  private readonly origins = inject(PlatformOrigins);
  private readonly hints = inject(WorkspaceHints, { optional: true });
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly picked = inject(PickedContext);

  /** Whose draft this is. */
  readonly agentId = input.required<string>();

  /**
   * The agent's slot (its row id), only to tell whether it has a container to rewrite in: 0 while
   * the agent is queued, no rewrite then. The rewrite itself is addressed by the agent.
   */
  readonly workspaceRowId = input(0);

  /** What the work is about, for the rewrite. */
  readonly preamble = input<string | null>(null);

  /** A prompt was delivered. */
  readonly sent = output<AgentDelivery>();

  /** A picked reference's ↗: open its lines in the Files tab. */
  readonly openReference = output<CodeReference>();

  /**
   * The outcomes the page declares for `openReference` (epic qits-2000), marked on each ↗; the page
   * reaches them itself.
   */
  readonly referenceOutcomes = input<readonly Pick<Outcome, 'interaction' | 'outcome'>[]>([]);

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

  /** The saved draft, in the browser only; read again on another device's `prompt-draft` hint. */
  private readonly draft = qitsResource(PROMPT_DRAFT, () => {
    const id = this.agentId();
    return this.browser && id ? { path: { id } } : undefined;
  });
  /** The restored line and the prompt box show the draft's read. */
  protected readonly draftSource = sourceMark(PROMPT_DRAFT);

  private readonly saving = qitsMutation(PROMPT_DRAFT_SAVE);
  private readonly discarding = qitsMutation(PROMPT_DRAFT_DELETE);
  private readonly prompting = qitsMutation(AGENT_PROMPT);
  private readonly rewriting = qitsMutation(PROMPT_REFINEMENT);

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The `updatedAt` this tab last wrote or read: the `prompt-draft` hint's own echo. */
  private lastWrittenAt: string | null = null;
  /** The agent whose draft was restored (the first answer of its read). */
  private restoredFor = '';
  /** A hint read the draft again: its answer is another device's, to reconcile. */
  private hinted = false;

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
    if (!this.browser) return;
    effect(() => {
      const agentId = this.agentId();
      untracked(() => this.picked.use(agentId));
    });
    // Each settled answer of the draft's read: the first restores, one a hint asked for reconciles.
    effect(() => {
      const status = this.draft.status();
      const agentId = this.agentId();
      if (status !== 'resolved' && status !== 'error' && status !== 'local') return;
      untracked(() => this.answered(agentId));
    });
    const hints = this.hints?.hints('prompt-draft');
    if (hints) {
      // The counter's movement is the signal; its first value is the restore above.
      let seen = -1;
      effect(() => {
        const hint = hints();
        untracked(() => {
          if (seen >= 0 && hint !== seen) this.reconcile();
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
    const preamble = this.preamble();
    try {
      const answer = await this.rewriting.run({
        ...agentRoute(this.origins.api('workspaces'), this.agentId(), 'prompt-refinements'),
        body: preamble ? { transcript: notes, preamble } : { transcript: notes },
      });
      this.refining.set(false);
      if (answer) this.promote(answer.prompt);
      else this.refineProblem.set(`The rewrite did not happen: ${why(0)}.`);
    } catch (error) {
      this.refining.set(false);
      this.refineProblem.set(`The rewrite did not happen: ${whyNot(error)}.`);
    }
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
    try {
      await this.discarding.run({ path: { id: this.agentId() } });
      this.lastWrittenAt = null;
      this.saveProblem.set(null);
    } catch (error) {
      this.saveProblem.set(`The draft could not be discarded: ${whyNot(error)}.`);
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
      let delivery: AgentDelivery | undefined;
      try {
        delivery = await this.prompting.run(promptParams(this.agentId(), text));
      } catch (error) {
        this.sendProblem.set(`The message was not sent: ${whyNot(error)}.`);
        return;
      }
      if (!delivery) {
        this.sendProblem.set(`The message was not sent: ${why(0)}.`);
        return;
      }
      this.sent.emit(delivery);
      this.clearTimer();
      this.text.set('');
      this.picked.clear();
      this.restoredAt.set(null);
      this.save.set('clean');
      // The prompt is said; a stale draft left behind shows as restored next time, never lost.
      try {
        await this.discarding.run({ path: { id: this.agentId() } });
        this.lastWrittenAt = null;
      } catch {
        // Left behind: it shows as restored next time.
      }
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

  /**
   * The draft's read answered: `ok` with the draft (null for none, a 404), or the failure. A read
   * again that failed keeps its value, so it says nothing new.
   */
  private readDraft():
    | { readonly ok: true; readonly value: PromptDraft | null }
    | { readonly ok: false; readonly error: unknown } {
    if (this.draft.status() === 'error') {
      return isMissing(this.draft)
        ? { ok: true, value: null }
        : { ok: false, error: this.draft.error() };
    }
    if (this.draft.reloadError() !== undefined) {
      return { ok: false, error: this.draft.reloadError() };
    }
    return { ok: true, value: promptDraftOf(this.draft.value()) };
  }

  /** An answer of the draft's read: the agent's first restores it, a hinted one reconciles. */
  private answered(agentId: string): void {
    if (!agentId) return;
    if (this.restoredFor !== agentId) {
      this.restoredFor = agentId;
      this.hinted = false;
      this.restore();
    } else if (this.hinted) {
      this.hinted = false;
      this.adopt();
    }
  }

  private restore(): void {
    const outcome = this.readDraft();
    if (!outcome.ok) {
      this.saveProblem.set(`The saved draft could not be read: ${whyNot(outcome.error)}.`);
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

  /** A `prompt-draft` hint: read the draft again, when nothing here is unsaved. */
  private reconcile(): void {
    if (!this.agentId() || this.save() !== 'clean' || this.restoredFor !== this.agentId()) return;
    this.hinted = true;
    this.draft.reload();
  }

  /** Adopt another device's draft when nothing here is unsaved, and it is not this tab's echo. */
  private adopt(): void {
    const outcome = this.readDraft();
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
    let written: { readonly draft?: { readonly updatedAt?: string | null } } | undefined;
    try {
      written = await this.saving.run(
        saveDraftParams(this.agentId(), this.text(), this.picked.references()),
      );
    } catch (error) {
      this.save.set('dirty');
      this.saveProblem.set(`The draft is not saved: ${whyNot(error)}.`);
      return;
    }
    if (!written) {
      this.save.set('dirty');
      this.saveProblem.set(`The draft is not saved: ${why(0)}.`);
      return;
    }
    this.lastWrittenAt = written.draft?.updatedAt ?? null;
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
