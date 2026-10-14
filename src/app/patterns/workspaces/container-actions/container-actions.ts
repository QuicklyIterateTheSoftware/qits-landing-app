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
import type { SlotDetail } from '$core/workspaces/agents.consumes';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** Which verb is waiting on the service: one Stop must not disable the wrong button's label. */
type Pending = 'start' | 'stop' | 'recreate' | null;

/**
 * A slot's container verbs (epic qits-1230), ported from qits-workspaces-frontend's status strip:
 * Start (`ensureContainer`) while it is not running, Stop while it is, and Recreate, which replaces
 * the container and so asks "Confirm recreate?" first. The service refuses a slot whose runner is
 * offline (409) and a recreate whose working tree it cannot prove clean (400); the refusal is said
 * below the buttons, in the service's words. Every answer, a refusal included, emits `changed`, so
 * the page reads the slot again (a refused verb still says the row is not what it looked like).
 */
@Component({
  selector: 'app-container-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Container">
      <ui-action-button [action]="toggle()" />
      <ui-action-button [action]="recreate()" />
      @if (confirming()) {
        <ui-action-button [action]="cancel" />
      }
    </div>
    @if (unavailable()) {
      <p class="m-0 mt-1 text-sm text-charcoal-brown-600">
        The slot’s runner is offline; the container waits for it to come back.
      </p>
    }
    @if (failure(); as failure) {
      <p class="m-0 mt-1 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
    }
  `,
})
export class ContainerActions {
  private readonly store = inject(AgentActionsStore);

  readonly slot = input.required<Pick<SlotDetail, 'id' | 'runtimeStatus'>>();

  /** A verb was answered (or refused): the page reads the slot again. */
  readonly changed = output<void>();

  protected readonly pending = signal<Pending>(null);
  protected readonly confirming = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly running = computed(() => this.slot().runtimeStatus === 'RUNNING');
  protected readonly unavailable = computed(() => this.slot().runtimeStatus === 'UNAVAILABLE');

  protected readonly toggle = computed((): Action => {
    const running = this.running();
    const verb = running ? 'stop' : 'start';
    return {
      label:
        this.pending() === verb
          ? running
            ? 'Stopping…'
            : 'Starting…'
          : running
            ? 'Stop'
            : 'Start',
      variant: 'muted',
      disabled: this.pending() !== null,
      callback: () => void (running ? this.stop() : this.start()),
    };
  });

  protected readonly recreate = computed((): Action => ({
    label:
      this.pending() === 'recreate'
        ? 'Recreating…'
        : this.confirming()
          ? 'Confirm recreate?'
          : 'Recreate',
    variant: this.confirming() ? 'danger' : 'muted',
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
    callback: () => this.confirming.set(false),
  };

  private start(): Promise<void> {
    return this.run('start', () => this.store.ensureContainer(this.id()));
  }

  private stop(): Promise<void> {
    return this.run('stop', () => this.store.stopContainer(this.id()));
  }

  private async pressRecreate(): Promise<void> {
    if (!this.confirming()) {
      this.confirming.set(true);
      this.failure.set(null);
      return;
    }
    this.confirming.set(false);
    await this.run('recreate', () => this.store.recreateContainer(this.id()));
  }

  private id(): number {
    return this.slot().id ?? 0;
  }

  private async run(
    verb: Exclude<Pending, null>,
    call: () => Promise<ActionOutcome<unknown>>,
  ): Promise<void> {
    this.pending.set(verb);
    this.failure.set(null);
    const outcome = await call();
    this.pending.set(null);
    if (!outcome.ok) this.failure.set(sentence(`That did not work — ${describeRefusal(outcome)}`));
    this.changed.emit();
  }
}
