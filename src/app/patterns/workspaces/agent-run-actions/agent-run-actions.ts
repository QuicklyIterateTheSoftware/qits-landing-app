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
  type ActionOutcome,
} from '$core/workspaces/agent-actions.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** An agent verb. */
export type AgentVerb = 'interrupt' | 'stop' | 'restart';

/** The run states Restart is offered in: a running, yielded or stopped agent. */
const RESTARTABLE: ReadonlySet<string> = new Set(['RUNNING', 'YIELDED', 'STOPPED']);

/**
 * An agent's own verbs (epic qits-1667), addressed by the agent, never by its slot:
 *
 * - **Interrupt**, while it is RUNNING: ESC to its harness (`AgentActionsStore.interruptAgent`),
 *   which stops the turn in flight and changes no run state;
 * - **Stop**, unless it is STOPPED, confirmed ("Confirm stop?"): the agent becomes STOPPED and the
 *   scheduler leaves it alone until a person restarts or prompts it; its container is untouched;
 * - **Restart**, while it is RUNNING, YIELDED or STOPPED, confirmed ("Confirm restart?"): a running
 *   harness is started again on its session, a yielded or stopped agent handed back to the
 *   scheduler.
 *
 * A refusal is said below the buttons in the service's words; an interrupt says what the service
 * said it did. Every answer, a refusal included, emits `changed`, so the page reads the agent again.
 */
@Component({
  selector: 'app-agent-run-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Agent">
      @if (running()) {
        <ui-action-button [action]="interrupt()" />
      }
      @if (stoppable()) {
        <ui-action-button [action]="stop()" />
      }
      @if (restartable()) {
        <ui-action-button [action]="restart()" />
      }
      @if (confirming()) {
        <ui-action-button [action]="cancel()" />
      }
    </div>
    @if (note(); as note) {
      <p class="m-0 mt-1 text-sm text-charcoal-brown-600" role="status">{{ note }}</p>
    }
    @if (failure(); as failure) {
      <p class="m-0 mt-1 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
    }
  `,
})
export class AgentRunActions {
  private readonly store = inject(AgentActionsStore);

  readonly agentId = input.required<string>();

  /** The agent's run state: which verbs are offered. */
  readonly runState = input<string | null | undefined>(null);

  /** A verb was answered (or refused): the page reads the agent again. */
  readonly changed = output<void>();

  protected readonly pending = signal<AgentVerb | null>(null);
  protected readonly confirming = signal<Exclude<AgentVerb, 'interrupt'> | null>(null);
  protected readonly note = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);

  protected readonly running = computed(() => this.runState() === 'RUNNING');
  protected readonly stoppable = computed(() => !!this.runState() && this.runState() !== 'STOPPED');
  protected readonly restartable = computed(() => RESTARTABLE.has(this.runState() ?? ''));

  protected readonly interrupt = computed((): Action => ({
    label: this.pending() === 'interrupt' ? 'Interrupting…' : 'Interrupt',
    variant: 'muted',
    disabled: this.pending() !== null,
    details: {
      title: 'Interrupt the agent',
      items: ['Sends ESC to its harness: the turn in flight stops, the agent stays running.'],
    },
    callback: () =>
      void this.run(
        'interrupt',
        () => this.store.interruptAgent(this.agentId()),
        (value) => this.note.set(sentence(value.detail?.trim() || 'Interrupted')),
      ),
  }));

  protected readonly stop = computed((): Action =>
    this.confirmed('stop', 'Stop', 'Stopping…', {
      title: 'Stop the agent',
      items: [
        'Stops its harness; nothing starts it again until a person restarts or prompts it.',
        'Its workspace and container stay as they are.',
      ],
    }),
  );

  protected readonly restart = computed((): Action =>
    this.confirmed('restart', 'Restart', 'Restarting…', {
      title: 'Restart the agent',
      items: [
        'A running harness is stopped and started again on its session.',
        'A yielded or stopped agent runs again once its workspace has room.',
      ],
    }),
  );

  protected readonly cancel = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.pending() !== null,
    callback: () => this.confirming.set(null),
  }));

  private confirmed(
    verb: 'stop' | 'restart',
    label: string,
    busy: string,
    details: NonNullable<Action['details']>,
  ): Action {
    const confirming = this.confirming() === verb;
    return {
      label: this.pending() === verb ? busy : confirming ? `Confirm ${verb}?` : label,
      variant: confirming ? 'danger' : 'muted',
      disabled: this.pending() !== null,
      details: confirming ? undefined : details,
      callback: () => void this.press(verb),
    };
  }

  private async press(verb: 'stop' | 'restart'): Promise<void> {
    if (this.confirming() !== verb) {
      this.confirming.set(verb);
      this.note.set(null);
      this.failure.set(null);
      return;
    }
    this.confirming.set(null);
    const id = this.agentId();
    await this.run(verb, () =>
      verb === 'stop' ? this.store.stopAgent(id) : this.store.restartAgent(id),
    );
  }

  private async run<T>(
    verb: AgentVerb,
    call: () => Promise<ActionOutcome<T>>,
    answered?: (value: T) => void,
  ): Promise<void> {
    this.pending.set(verb);
    this.note.set(null);
    this.failure.set(null);
    const outcome = await call();
    this.pending.set(null);
    if (outcome.ok) answered?.(outcome.value);
    else this.failure.set(sentence(`That did not work — ${describeRefusal(outcome)}`));
    this.changed.emit();
  }
}
