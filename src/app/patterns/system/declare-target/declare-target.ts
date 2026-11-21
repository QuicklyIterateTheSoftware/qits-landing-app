import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { outcomes, qitsMutation, stay } from '@qits/angular';
import { optionalSlots, SLOT_TYPES, slotCount, type SlotType } from '$core/system/target-rows';
import { explainTargetRefusal, targetRefusalOf } from '$core/system/target-refusals';
import { TARGET_CREATE } from '$core/system/targets.operations';
import { CopyText } from '$patterns/workspaces/copy-text/copy-text';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** qits-system's target names: a lower-case letter, then up to 63 of a-z, 0-9 and `-`. */
const NAME = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * The Targets page's Declare a target form (qits-2351, `createTarget`): a name (required,
 * qits-system's pattern, checked here), a description, the slots reserved for ci, workspace and
 * desk, and an optional slots total (0..1024) for the install line (else the reservations' sum).
 *
 * On 201 the answer's one-time install line is shown once, with Copy: the registration token in it
 * works once and is lost when the page is left, and rotating the target's token gives a new one.
 * The page then reads the targets again (`declared`): a declared target publishes no event. A
 * refusal (`TARGET_NAME_TAKEN`, a 503 while commissioning is off, a 403) stays on the form, in the
 * page's words (`target-refusals.ts`).
 */
@Component({
  selector: 'app-declare-target',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, CopyText],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3" aria-labelledby="declare-target">
      <h2 id="declare-target" class="m-0 text-base font-semibold text-fg">Declare a target</h2>
      <form class="flex max-w-xl flex-col gap-3" (submit)="$event.preventDefault(); declare()">
        <label class="flex flex-col gap-1 text-sm text-fg">
          Name
          <input
            class="h-8 rounded-md border border-line-strong bg-surface px-2 font-mono text-sm"
            type="text"
            name="name"
            autocomplete="off"
            [value]="name()"
            (input)="name.set(text($event))"
          />
          @if (nameInvalid()) {
            <span class="text-xs text-danger">
              A lower-case letter, then up to 63 lower-case letters, digits and hyphens.
            </span>
          }
        </label>
        <label class="flex flex-col gap-1 text-sm text-fg">
          Description
          <input
            class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
            type="text"
            name="description"
            [value]="description()"
            (input)="description.set(text($event))"
          />
        </label>
        <fieldset class="m-0 flex flex-wrap gap-3 border-0 p-0">
          <legend class="mb-1 text-sm text-fg">Reserved slots</legend>
          @for (type of slotTypes; track type) {
            <label class="flex flex-col gap-1 text-xs text-fg-soft">
              {{ type }}
              <input
                class="h-8 w-20 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                type="text"
                inputmode="numeric"
                [name]="'reserved-' + type"
                [value]="reservations()[type]"
                (input)="reserve(type, text($event))"
              />
            </label>
          }
          <label class="flex flex-col gap-1 text-xs text-fg-soft">
            slots total (optional)
            <input
              class="h-8 w-28 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
              type="text"
              inputmode="numeric"
              name="slots"
              [value]="slots()"
              (input)="slots.set(text($event))"
            />
          </label>
        </fieldset>
        @if (countsInvalid()) {
          <p class="m-0 text-xs text-danger">Each count is a whole number from 0 to 1024.</p>
        }
        <div class="flex flex-wrap gap-2">
          <ui-action-button [action]="submit()" />
        </div>
        @if (refusal(); as refusal) {
          <p class="m-0 text-sm text-danger" role="alert">{{ refusal }}</p>
        }
      </form>
      @if (installLine(); as line) {
        <div
          class="flex max-w-3xl flex-col gap-2 rounded-md border border-line bg-surface-muted p-3"
          role="region"
          aria-label="Install line"
        >
          <p class="m-0 text-sm text-fg">
            {{ declaredName() }} is declared. Run this on its node to install its runner. The token
            in it works once and is lost when you leave this page; rotating the target’s
            registration token gives a new one.
          </p>
          <app-copy-text [text]="line" label="Copy install line" />
        </div>
      }
    </section>
  `,
})
export class DeclareTarget {
  /** A target was declared: the page reads the targets again. */
  readonly declared = output<void>();

  protected readonly declaring = outcomes('declare-target', { sent: stay() });

  private readonly createRun = qitsMutation(TARGET_CREATE, { offline: 'online-only' });

  protected readonly slotTypes = SLOT_TYPES;
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly reservations = signal<Readonly<Record<SlotType, string>>>({
    ci: '',
    workspace: '',
    desk: '',
  });
  protected readonly slots = signal('');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);
  /** The install line the last declaration answered, shown once. */
  protected readonly installLine = signal<string | null>(null);
  protected readonly declaredName = signal('');

  protected readonly nameInvalid = computed(() => !!this.name() && !NAME.test(this.name()));
  protected readonly countsInvalid = computed(
    () =>
      SLOT_TYPES.some((type) => slotCount(this.reservations()[type]) === undefined) ||
      optionalSlots(this.slots()) === false,
  );

  protected readonly submit = computed((): Action => ({
    label: this.busy() ? 'Declaring…' : 'Declare target',
    variant: 'success',
    disabled: this.busy() || !NAME.test(this.name()) || this.countsInvalid(),
    outcomes: [this.declaring.sent],
    callback: () => void this.declare(),
  }));

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected reserve(type: SlotType, value: string): void {
    this.reservations.update((counts) => ({ ...counts, [type]: value }));
  }

  protected async declare(): Promise<void> {
    const name = this.name();
    const slots = optionalSlots(this.slots());
    if (this.busy() || !NAME.test(name) || this.countsInvalid() || slots === false) return;
    const reservations = Object.fromEntries(
      SLOT_TYPES.map((type) => [type, slotCount(this.reservations()[type]) ?? 0]),
    );
    const description = this.description().trim();
    this.busy.set(true);
    this.refusal.set(null);
    this.installLine.set(null);
    try {
      const answer = await this.createRun.run({
        body: {
          name,
          ...(description ? { description } : {}),
          reservations,
          ...(slots === undefined ? {} : { slots }),
        },
      });
      this.declaredName.set(name);
      this.installLine.set(answer?.installLine ?? null);
      this.name.set('');
      this.description.set('');
      this.reservations.set({ ci: '', workspace: '', desk: '' });
      this.slots.set('');
      this.declared.emit();
    } catch (error) {
      this.refusal.set(explainTargetRefusal(targetRefusalOf(error), 'declare the target'));
    } finally {
      this.busy.set(false);
      this.declaring.sent.reach();
    }
  }
}
