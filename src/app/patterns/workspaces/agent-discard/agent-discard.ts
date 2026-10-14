import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AgentActionsStore,
  describeRefusal,
  sentence,
  type Refusal,
} from '$core/workspaces/agent-actions.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** Where the discard is: not asked, asked to confirm, or refused and offering force. */
export type DiscardStep = 'closed' | 'confirm' | 'force';

/**
 * Discard an agent (epic qits-1230), ported from qits-workspaces-frontend's agent page. The first
 * press asks "Confirm discard?"; the second sends it without force. When the service refuses (a
 * 409: work in the agent's worktrees that never reached the git host, a daemon that does not
 * answer so they cannot be checked, a harness still busy), its reason is shown and "Discard anyway"
 * sends it again with `force`, throwing that work away. Any other failure is said as it is. A
 * discard that went through emits `discarded`, so the page reads the agent again.
 */
@Component({
  selector: 'app-agent-discard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    @if (step() === 'force') {
      <div
        class="flex flex-col gap-2 rounded-md border border-cinnabar-200 bg-cinnabar-50 px-3 py-2 text-sm"
        role="alert"
      >
        <p class="m-0 font-semibold text-cinnabar-800">The service refused the discard.</p>
        <p class="m-0 text-cinnabar-800">{{ refusal()?.message ?? refusalStatus() }}</p>
        <div class="flex flex-wrap gap-2">
          <ui-action-button [action]="force()" />
          <ui-action-button [action]="cancel()" />
        </div>
      </div>
    } @else {
      <div class="flex flex-wrap items-center gap-2">
        <ui-action-button [action]="discard()" />
        @if (step() === 'confirm') {
          <ui-action-button [action]="cancel()" />
        }
      </div>
    }
    @if (problem(); as problem) {
      <p class="m-0 mt-1 text-sm text-cinnabar-700" role="alert">{{ problem }}</p>
    }
  `,
})
export class AgentDiscard {
  private readonly store = inject(AgentActionsStore);

  readonly agentId = input.required<string>();

  /** The agent was removed: the page reads it again. */
  readonly discarded = output<void>();

  protected readonly step = signal<DiscardStep>('closed');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<Refusal | null>(null);
  protected readonly problem = signal<string | null>(null);

  protected readonly refusalStatus = computed(() => {
    const refusal = this.refusal();
    return refusal ? describeRefusal(refusal) : '';
  });

  protected readonly discard = computed((): Action => ({
    label: this.busy() ? 'Discarding…' : this.step() === 'confirm' ? 'Confirm discard?' : 'Discard',
    variant: this.step() === 'confirm' ? 'danger' : 'muted',
    disabled: this.busy(),
    details:
      this.step() === 'confirm'
        ? undefined
        : {
            title: 'Discard the agent',
            items: [
              'Removes the agent, its worktrees, its credential and its prompt draft.',
              'Refused while its worktrees hold work that never reached the git host.',
            ],
          },
    callback: () => void this.press(),
  }));

  protected readonly force = computed((): Action => ({
    label: this.busy() ? 'Discarding…' : 'Discard anyway',
    variant: 'danger',
    disabled: this.busy(),
    callback: () => void this.send(true),
  }));

  protected readonly cancel = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.close(),
  }));

  private async press(): Promise<void> {
    if (this.step() === 'closed') {
      this.step.set('confirm');
      this.problem.set(null);
      return;
    }
    await this.send(false);
  }

  private close(): void {
    this.step.set('closed');
    this.refusal.set(null);
  }

  private async send(force: boolean): Promise<void> {
    this.busy.set(true);
    this.problem.set(null);
    const outcome = await this.store.discardAgent(this.agentId(), force);
    this.busy.set(false);
    if (outcome.ok) {
      this.close();
      this.discarded.emit();
      return;
    }
    if (!force && outcome.status === 409) {
      this.refusal.set(outcome);
      this.step.set('force');
      return;
    }
    this.close();
    this.problem.set(sentence(`The agent was not discarded — ${describeRefusal(outcome)}`));
  }
}
