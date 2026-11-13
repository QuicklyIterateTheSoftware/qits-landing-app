import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsMutation,
  type QitsResourceRef,
} from '@qits/angular';
import { notRemoved } from '$core/workspaces/agent-lists';
import type { SlotAgent, SlotAgents, SlotDetail } from '$core/workspaces/agents.consumes';
import {
  CONTAINER_ENSURE,
  CONTAINER_RECREATE,
  CONTAINER_STOP,
} from '$core/workspaces/container-actions.operations';
import {
  describeRefusal,
  outcomeOf,
  sentence,
  type ActionOutcome,
} from '$core/workspaces/refusals';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** Which verb is waiting on the service: one Stop must not disable the wrong button's label. */
type Pending = 'start' | 'stop' | 'recreate' | null;

/** The verbs that end what the slot's agents are doing, and so are confirmed first. */
type Confirmed = 'stop' | 'recreate';

/** An agent of the slot, as the confirm names it. */
export type HostedAgent = Pick<SlotAgent, 'agentId' | 'entityId'>;

/** The slot's hosted agents' read (`SLOT_AGENTS`), as the page hands it over. */
export type HostedRead = QitsResourceRef<SlotAgents>;

/** The hosted agents before they are read: none. */
const NO_AGENTS: SlotAgents = { agents: [] };

/** How an agent reads in a sentence: its work item, else its id's first block. */
export function agentName(agent: HostedAgent | undefined, agentId: string): string {
  return agent?.entityId || `agent ${agentId.split('-')[0]}`;
}

/**
 * A slot's container verbs (epic qits-1230), ported from qits-workspaces-frontend's status strip,
 * on the workspace page only (epic qits-1667: the agent page has an agent's own verbs instead):
 * Start (`ensureContainer`) while it is not running, Stop while it is, and Recreate, which replaces
 * the container. Stop and Recreate end whatever the slot's agents are doing, so each asks first
 * ("Confirm stop?", "Confirm recreate?") and names the agents it affects, from the slot's list
 * (`hosted`, the page's `SLOT_AGENTS` read, its agents not removed). After the verb, the agents the
 * service says it affected (`affectedAgentIds` of the answer) are named. The service refuses a slot
 * whose runner is offline (409) and a recreate whose working tree it cannot prove clean (400); the
 * refusal is said below the buttons, in the service's words. Every answer, a refusal included,
 * emits `changed`, so the page reads the slot again (a refused verb still says the row is not what
 * it looked like).
 *
 * The verbs write through `qitsMutation` over `container-actions.operations.ts` (qits-2146). What
 * it shows carries the data marks (qits-2141): the buttons are the slot (`qitsEntity`, by `id`),
 * their words derived from its `runtimeStatus`; the agents' lines name the hosted read as their
 * source, derived from its `agents`.
 */
@Component({
  selector: 'app-container-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, QitsEntity, QitsEntityList, QitsField],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Container"
      [qitsEntity]="slot()"
      entityKey="id"
    >
      <ui-action-button
        [action]="toggle()"
        [fieldOf]="slot()"
        [qitsField]="{ derived: ['runtimeStatus'] }"
      />
      <ui-action-button [action]="recreate()" />
      @if (confirming()) {
        <ui-action-button [action]="cancel" />
      }
    </div>
    @if (confirming(); as verb) {
      <p
        class="m-0 mt-1 text-sm text-fg-soft"
        role="status"
        data-confirm
        [qitsEntityList]="hosted()"
        [fieldOf]="answer()"
        [qitsField]="{ derived: ['agents'] }"
      >
        @if (agents().length) {
          {{ verb === 'stop' ? 'Stopping' : 'Recreating' }} the container affects
          {{ agents().length === 1 ? 'its agent' : 'its ' + agents().length + ' agents' }}:
          {{ hostedNames() }}.
        } @else {
          No agent is in this workspace.
        }
      </p>
    }
    @if (affected(); as affected) {
      <p
        class="m-0 mt-1 text-sm text-fg-soft"
        role="status"
        data-affected
        [qitsEntityList]="hosted()"
        [fieldOf]="answer()"
        [qitsField]="{ derived: ['agents'] }"
      >
        @if (affected.length) {
          Affected {{ affected.length === 1 ? 'agent' : 'agents' }}: {{ affectedNames() }}.
        } @else {
          The service says no agent was affected.
        }
      </p>
    }
    @if (unavailable()) {
      <p
        class="m-0 mt-1 text-sm text-fg-soft"
        [qitsEntity]="slot()"
        entityKey="id"
        [fieldOf]="slot()"
        [qitsField]="{ derived: ['runtimeStatus'] }"
      >
        The slot’s runner is offline; the container waits for it to come back.
      </p>
    }
    @if (failure(); as failure) {
      <p class="m-0 mt-1 text-sm text-danger" role="alert">{{ failure }}</p>
    }
  `,
})
export class ContainerActions {
  private readonly ensuring = qitsMutation(CONTAINER_ENSURE);
  private readonly stopping = qitsMutation(CONTAINER_STOP);
  private readonly recreating = qitsMutation(CONTAINER_RECREATE);

  readonly slot = input.required<Pick<SlotDetail, 'id' | 'runtimeStatus'>>();

  /** The read of the agents the slot hosts, which a stop or recreate affects. */
  readonly hosted = input.required<HostedRead>();

  /** The hosted agents' answer; none until it answered. */
  protected readonly answer = computed(
    () => (this.hosted().hasValue() ? this.hosted().value() : undefined) ?? NO_AGENTS,
  );

  /** The agents the slot hosts, not removed. */
  protected readonly agents = computed((): readonly HostedAgent[] =>
    notRemoved(this.answer().agents),
  );

  /** A verb was answered (or refused): the page reads the slot again. */
  readonly changed = output<void>();

  protected readonly pending = signal<Pending>(null);
  protected readonly confirming = signal<Confirmed | null>(null);
  protected readonly failure = signal<string | null>(null);
  /** The agents the last stop or recreate affected, as the service answered; null before one. */
  protected readonly affected = signal<readonly string[] | null>(null);

  protected readonly hostedNames = computed(() =>
    this.agents()
      .map((agent) => agentName(agent, agent.agentId ?? ''))
      .join(', '),
  );

  protected readonly affectedNames = computed(() =>
    (this.affected() ?? [])
      .map((id) =>
        agentName(
          this.agents().find((agent) => agent.agentId === id),
          id,
        ),
      )
      .join(', '),
  );

  protected readonly running = computed(() => this.slot().runtimeStatus === 'RUNNING');
  protected readonly unavailable = computed(() => this.slot().runtimeStatus === 'UNAVAILABLE');

  protected readonly toggle = computed((): Action => {
    const running = this.running();
    const verb = running ? 'stop' : 'start';
    const confirming = running && this.confirming() === 'stop';
    return {
      label:
        this.pending() === verb
          ? running
            ? 'Stopping…'
            : 'Starting…'
          : confirming
            ? 'Confirm stop?'
            : running
              ? 'Stop'
              : 'Start',
      variant: confirming ? 'danger' : 'muted',
      disabled: this.pending() !== null,
      callback: () => void (running ? this.pressStop() : this.start()),
    };
  });

  protected readonly recreate = computed((): Action => ({
    label:
      this.pending() === 'recreate'
        ? 'Recreating…'
        : this.confirming() === 'recreate'
          ? 'Confirm recreate?'
          : 'Recreate',
    variant: this.confirming() === 'recreate' ? 'danger' : 'muted',
    disabled: this.pending() !== null,
    details: this.confirming()
      ? undefined
      : {
          title: 'Recreate the container',
          items: [
            'Throws the container away and starts a new one from the current image.',
            'Refused unless the working tree is provably clean.',
          ],
        },
    callback: () => void this.pressRecreate(),
  }));

  protected readonly cancel: Action = {
    label: 'Cancel',
    variant: 'muted',
    callback: () => this.confirming.set(null),
  };

  private start(): Promise<void> {
    return this.run('start', () => outcomeOf(this.ensuring, { path: { id: this.id() } }));
  }

  private async pressStop(): Promise<void> {
    if (this.confirm('stop')) return;
    await this.run(
      'stop',
      () => outcomeOf(this.stopping, { path: { id: this.id() } }),
      (slot) => slot.affectedAgentIds,
    );
  }

  private async pressRecreate(): Promise<void> {
    if (this.confirm('recreate')) return;
    await this.run(
      'recreate',
      () => outcomeOf(this.recreating, { path: { id: this.id() } }),
      (recreate) => recreate.affectedAgentIds,
    );
  }

  /** Asks first: true while `verb` waits for its confirmation, false once it is confirmed. */
  private confirm(verb: Confirmed): boolean {
    if (this.confirming() !== verb) {
      this.confirming.set(verb);
      this.failure.set(null);
      this.affected.set(null);
      return true;
    }
    this.confirming.set(null);
    return false;
  }

  private id(): number {
    return this.slot().id ?? 0;
  }

  /** Runs a verb; `affected` reads the agents the answer names, for a stop or a recreate. */
  private async run<T>(
    verb: Exclude<Pending, null>,
    call: () => Promise<ActionOutcome<T>>,
    affected?: (value: T) => readonly string[] | undefined,
  ): Promise<void> {
    this.pending.set(verb);
    this.failure.set(null);
    this.affected.set(null);
    const outcome = await call();
    this.pending.set(null);
    if (!outcome.ok) {
      this.failure.set(sentence(`That did not work — ${describeRefusal(outcome)}`));
    } else if (affected) {
      this.affected.set(affected(outcome.value) ?? []);
    }
    this.changed.emit();
  }
}
