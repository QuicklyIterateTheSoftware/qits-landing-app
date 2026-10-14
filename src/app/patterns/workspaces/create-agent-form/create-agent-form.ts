import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { SelectedWork } from '$core/work/selected-work';
import {
  AGENT_HARNESSES,
  AgentActionsStore,
  describeRefusal,
  sentence,
  type AgentHarnessName,
} from '$core/workspaces/agent-actions.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** Statuses whose item gets no new agent: its work is over. */
const CLOSED = new Set(['DONE', 'DROPPED']);

/**
 * The Workspaces page's "New agent" form (epic qits-1230), ported from qits-workspaces-frontend's
 * overview: a person creates an agent for an existing ticket or epic of the project, never for a
 * free goal. The item is typed by its qualified id (the project's open tickets and epics are
 * offered), and resolved from the project's work (`SelectedWork`) to the id, qualified id and kind
 * the service takes; then the harness (the service's default unless one is chosen), an optional
 * first instruction, and admin mode ("Enable docker socket": the agent runs in a slot that holds
 * the host's docker socket, which makes it root-equivalent on the host; it starts unticked and is
 * unticked again after every agent made).
 *
 * Create agent sends `createAgent`; the service places the agent in a slot (or queues it) and
 * starts it, or answers the item's ACTIVE agent. Either way the item's agent page opens and
 * `created` fires, so the list reads again. A refusal is said below the form, in the service's
 * words.
 */
@Component({
  selector: 'app-create-agent-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-3 rounded-md border border-charcoal-brown-200 px-4 py-3 text-sm"
      aria-labelledby="new-agent"
    >
      <h2 id="new-agent" class="m-0 text-base font-semibold text-charcoal-brown-900">New agent</h2>
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Work item</span>
          <input
            class="h-8 w-56 rounded-md border border-charcoal-brown-300 bg-white px-2 font-mono text-sm"
            type="text"
            autocomplete="off"
            spellcheck="false"
            maxlength="80"
            list="new-agent-items"
            [placeholder]="placeholder()"
            [value]="item()"
            (input)="item.set($any($event.target).value)"
          />
          <datalist id="new-agent-items">
            @for (entry of candidates(); track entry.id) {
              <option [value]="entry.qualifiedId">{{ entry.title }}</option>
            }
          </datalist>
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Harness</span>
          <select
            class="h-8 rounded-md border border-charcoal-brown-300 bg-white px-2 text-sm"
            [value]="harness()"
            (change)="harness.set($any($event.target).value)"
          >
            <option value="">Default</option>
            @for (option of harnesses; track option) {
              <option [value]="option">{{ option.toLowerCase() }}</option>
            }
          </select>
        </label>
      </div>
      <label class="flex flex-col gap-1">
        <span class="font-semibold text-charcoal-brown-700">First instruction (optional)</span>
        <textarea
          class="rounded-md border border-charcoal-brown-300 bg-white px-2 py-1.5 font-sans text-sm text-charcoal-brown-900"
          rows="3"
          [value]="instruction()"
          (input)="instruction.set($any($event.target).value)"
        ></textarea>
      </label>
      <label class="flex items-start gap-2">
        <input
          class="mt-1"
          type="checkbox"
          [checked]="admin()"
          (change)="admin.set($any($event.target).checked)"
        />
        <span class="flex flex-col">
          <span class="font-semibold text-charcoal-brown-700">Enable docker socket</span>
          <span class="text-charcoal-brown-600"
            >Admin mode: the agent runs in a workspace that can drive the host’s docker daemon,
            which makes it root-equivalent on the host. Only for administrative work.</span
          >
        </span>
      </label>
      <div class="flex flex-wrap items-center gap-3">
        <ui-action-button [action]="create()" />
        <span class="text-charcoal-brown-600"
          >Takes a ticket or an epic by its id. An item that already has an agent opens that
          agent.</span
        >
      </div>
      @if (failure(); as failure) {
        <p class="m-0 text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class CreateAgentForm {
  private readonly work = inject(SelectedWork);
  private readonly store = inject(AgentActionsStore);
  private readonly router = inject(Router);

  /** The project's wrapper repository, which the agent works in. */
  readonly repositoryId = input.required<string>();
  /** The project's slug, for the agent page's address. */
  readonly slug = input.required<string>();

  /** An agent was made (or found): the page reads its list again. */
  readonly created = output<void>();

  protected readonly harnesses = AGENT_HARNESSES;
  protected readonly item = signal('');
  protected readonly harness = signal<AgentHarnessName | ''>('');
  protected readonly instruction = signal('');
  protected readonly admin = signal(false);
  protected readonly creating = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** The project's open tickets and epics, by qualified id. */
  protected readonly candidates = computed(() =>
    this.work
      .entries()
      .filter(
        (e) =>
          (e.archetype === 'TICKET' || e.archetype === 'EPIC') &&
          !!e.qualifiedId &&
          !CLOSED.has(e.status ?? ''),
      ),
  );

  protected readonly placeholder = computed(() => `${this.slug() || 'qits'}-617`);

  protected readonly create = computed((): Action => ({
    label: this.creating() ? 'Creating…' : 'Create agent',
    variant: 'success',
    disabled: this.creating() || !this.repositoryId() || !this.item().trim(),
    callback: () => void this.send(),
  }));

  private async send(): Promise<void> {
    const ref = this.item().trim();
    if (!ref || this.creating()) return;
    const entry = this.work.entries().find((e) => e.qualifiedId === ref);
    if (!entry?.id || !entry.qualifiedId) {
      this.failure.set(`There is no work item ${ref} in this project.`);
      return;
    }
    if (entry.archetype !== 'TICKET' && entry.archetype !== 'EPIC') {
      this.failure.set(
        `${ref} is a ${(entry.archetype ?? 'work item').toLowerCase()}. Only a ticket or an epic gets an agent.`,
      );
      return;
    }
    this.creating.set(true);
    this.failure.set(null);
    const harness = this.harness() || undefined;
    const instruction = this.instruction().trim() || undefined;
    const outcome = await this.store.createAgent({
      repositoryId: this.repositoryId(),
      workId: entry.id,
      entityId: entry.qualifiedId,
      kind: entry.archetype === 'EPIC' ? 'EPIC' : 'TICKET',
      // The posture as the checkbox stands at the press, sent either way.
      admin: this.admin(),
      ...(harness ? { harness } : {}),
      ...(instruction ? { instruction } : {}),
    });
    this.creating.set(false);
    if (!outcome.ok) {
      this.failure.set(sentence(`Could not create the agent — ${describeRefusal(outcome)}`));
      this.created.emit();
      return;
    }
    this.item.set('');
    this.instruction.set('');
    this.admin.set(false);
    this.created.emit();
    await this.router.navigateByUrl(
      `/projects/${this.slug()}/work/detail/${entry.qualifiedId}/agent`,
    );
  }
}
