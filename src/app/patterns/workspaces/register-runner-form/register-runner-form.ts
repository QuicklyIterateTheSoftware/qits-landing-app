import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { describeRefusal, sentence } from '$core/workspaces/agent-actions.store';
import {
  memoryLimitProblemOf,
  nameProblemOf,
  slotsProblemOf,
  swapLimitProblemOf,
} from '$core/workspaces/runner-labels';
import type { RunnerRegistration } from '$core/workspaces/runners.consumes';
import { RunnersStore, type NewRunner } from '$core/workspaces/runners.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

const INPUT =
  'h-8 rounded-md border border-charcoal-brown-300 bg-white px-2 text-sm text-charcoal-brown-900';

/**
 * The Runners page's "Register a runner" form (epic qits-1230), ported from qits-workspaces-
 * frontend's runners page: a name (`[a-z][a-z0-9-]{0,63}`), an optional description, the slots
 * (0 or more; 0 drains it) and the workspace memory and memory+swap caps (blank: the platform
 * default). A bad field is said under it before anything is sent; the service is still the
 * authority, and its refusal is said below the form in its own words.
 *
 * Register sends `createRunner`, leaving out what is blank. Its answer, the one-time install line,
 * goes to the page (`registered`), which shows it once; the form empties.
 */
@Component({
  selector: 'app-register-runner-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-3 rounded-md border border-charcoal-brown-200 px-4 py-3 text-sm"
      aria-labelledby="register-runner"
    >
      <h2 id="register-runner" class="m-0 text-base font-semibold text-charcoal-brown-900">
        Register a runner
      </h2>
      <div class="flex flex-wrap items-start gap-3">
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Name</span>
          <input
            [class]="inputClass + ' w-44 font-mono'"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="build-box-1"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
          @if (nameProblem(); as problem) {
            <span class="max-w-44 text-cinnabar-700" role="alert">{{ problem }}</span>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Description (optional)</span>
          <input
            [class]="inputClass + ' w-56'"
            type="text"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Slots</span>
          <input
            [class]="inputClass + ' w-20'"
            type="number"
            min="0"
            [value]="slots()"
            (input)="slots.set($any($event.target).valueAsNumber)"
          />
          @if (slotsProblem(); as problem) {
            <span class="max-w-44 text-cinnabar-700" role="alert">{{ problem }}</span>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Workspace memory</span>
          <input
            [class]="inputClass + ' w-28 font-mono'"
            type="text"
            placeholder="8g"
            [value]="memory()"
            (input)="memory.set($any($event.target).value)"
          />
          <span class="text-charcoal-brown-500">Blank: platform default.</span>
          @if (memoryProblem(); as problem) {
            <span class="max-w-56 text-cinnabar-700" role="alert">{{ problem }}</span>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-semibold text-charcoal-brown-700">Workspace memory + swap</span>
          <input
            [class]="inputClass + ' w-28 font-mono'"
            type="text"
            placeholder="8g"
            [value]="swap()"
            (input)="swap.set($any($event.target).value)"
          />
          <span class="max-w-56 text-charcoal-brown-500"
            >Total incl. memory; blank: no swap beyond the memory cap; -1: unlimited swap.</span
          >
          @if (swapProblem(); as problem) {
            <span class="max-w-56 text-cinnabar-700" role="alert">{{ problem }}</span>
          }
        </label>
      </div>
      <div><ui-action-button [action]="register()" /></div>
      @if (failure(); as failure) {
        <p class="m-0 text-cinnabar-700" role="alert">{{ failure }}</p>
      }
    </section>
  `,
})
export class RegisterRunnerForm {
  private readonly store = inject(RunnersStore);

  /** A runner was registered: its one-time install line, for the page to show. */
  readonly registered = output<RunnerRegistration>();

  protected readonly inputClass = INPUT;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly slots = signal(1);
  protected readonly memory = signal('');
  protected readonly swap = signal('');
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  /** Fields are judged only once Register was pressed, so nothing is flagged before typing. */
  private readonly submitted = signal(false);

  protected readonly nameProblem = computed(() =>
    this.submitted() ? nameProblemOf(this.name()) : '',
  );
  protected readonly slotsProblem = computed(() =>
    this.submitted() ? slotsProblemOf(this.slots()) : '',
  );
  protected readonly memoryProblem = computed(() =>
    this.submitted() ? memoryLimitProblemOf(this.memory()) : '',
  );
  protected readonly swapProblem = computed(() =>
    this.submitted() ? swapLimitProblemOf(this.memory(), this.swap()) : '',
  );

  protected readonly register = computed((): Action => ({
    label: this.busy() ? 'Registering…' : 'Register',
    variant: 'success',
    disabled: this.busy(),
    callback: () => void this.send(),
  }));

  private async send(): Promise<void> {
    this.submitted.set(true);
    if (this.nameProblem() || this.slotsProblem() || this.memoryProblem() || this.swapProblem()) {
      return;
    }
    const description = this.description().trim();
    const memory = this.memory().trim();
    const swap = this.swap().trim();
    const runner: NewRunner = {
      name: this.name(),
      ...(description ? { description } : {}),
      slots: this.slots(),
      ...(memory ? { workspaceMemoryLimit: memory } : {}),
      ...(swap ? { workspaceMemorySwapLimit: swap } : {}),
    };
    this.busy.set(true);
    this.failure.set(null);
    const outcome = await this.store.createRunner(runner);
    this.busy.set(false);
    if (!outcome.ok) {
      this.failure.set(sentence(`Could not register this runner — ${describeRefusal(outcome)}`));
      return;
    }
    this.name.set('');
    this.description.set('');
    this.slots.set(1);
    this.memory.set('');
    this.swap.set('');
    this.submitted.set(false);
    this.registered.emit(outcome.value);
  }
}
