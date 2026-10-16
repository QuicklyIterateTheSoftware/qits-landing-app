import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  describeRefusal,
  sentence,
  type ActionOutcome,
} from '$core/workspaces/agent-actions.store';
import { NONE, relativeSince, runtimeLabel } from '$core/workspaces/agent-labels';
import {
  checkLineOf,
  connectivityOf,
  dataEntriesOf,
  healthAtOf,
  healthBadgeOf,
  isUpdating,
  memoryLimitProblemOf,
  memoryOf,
  presenceOf,
  quarantineReasonOf,
  slotsProblemOf,
  swapLimitProblemOf,
  swapOf,
} from '$core/workspaces/runner-labels';
import type { Runner, RunnerRegistration } from '$core/workspaces/runners.consumes';
import {
  RUNNER_OWNS_WORKSPACES,
  RunnersStore,
  type RunnerChange,
} from '$core/workspaces/runners.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { CopyText } from '$patterns/workspaces/copy-text/copy-text';

/** One of the project's slots placed on this runner. */
export interface RunnerSlot {
  readonly id?: number;
  readonly workspaceId?: string;
  readonly runtimeStatus?: string;
}

/** A runner's editable fields, held as a draft until saved or cancelled. */
interface Draft {
  readonly slots: number;
  readonly description: string;
  /** As typed; blank is the platform default. */
  readonly memory: string;
  /** As typed; blank is no swap beyond the memory cap, `-1` unlimited swap. */
  readonly swap: string;
}

/** A workspace a refused delete named: its row id, and its slot page when it is the project's. */
interface Owner {
  readonly id: number;
  readonly label: string;
  readonly link: string | null;
}

/** Which verb is waiting on the service. */
type Busy = 'save' | 'rotate' | 'greenlight' | 'delete' | 'login' | null;

const INPUT =
  'h-8 rounded-md border border-charcoal-brown-300 bg-white px-2 text-sm text-charcoal-brown-900';

/**
 * One workspace runner on the Runners page (epic qits-1230), ported from qits-workspaces-frontend's
 * runners page row:
 *
 * - its connection, version (and "updating" while it rolls over to the pinned one), slot counts,
 *   memory caps and quarantine (with the service's reason), and the project's slots placed on it,
 *   each a link to its slot page;
 * - the node's agent login: Claude's and Kimi's presence, Re-check (`requestLoginCheck`; the answer
 *   arrives with a later read of the list), and the login commands, each with Copy;
 * - the last health check and its checks; Run health check (`requestHealthcheck`) stays pressed
 *   until a newer check lands; Node details reads the newest check's data (`loadHealth`);
 * - Actions: Edit (slots, description, memory caps; `patchRunner`), Rotate token (the one-time
 *   install line goes to the page, `registration`), Greenlight on a quarantined runner (lifts the
 *   quarantine; nothing here puts a runner in quarantine, the service does that after a failed
 *   check) and Delete, confirmed; refused while the runner owns workspaces, which are listed.
 *
 * Every refusal is said in the service's words. Every write, a refusal included, emits `changed`,
 * so the page reads the list again. A requested health or login check settles later, and shows with
 * the page's next read (`RunnersStore.follow`): qits-workspaces announces no runner event, so until
 * a slot event or another write that read may not come (qits-1270).
 */
@Component({
  selector: 'app-runner-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, Chip, CopyText, RouterLink],
  host: { class: 'block' },
  template: `
    <article
      class="flex flex-col gap-3 rounded-md border border-charcoal-brown-200 px-4 py-3 text-sm"
      [attr.aria-label]="'Runner ' + runner().name"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 class="m-0 font-mono text-base font-semibold text-charcoal-brown-900">
          {{ runner().name }}
        </h3>
        <ui-chip [label]="connectivity().label" [tone]="connectivity().tone" />
        <span class="text-charcoal-brown-600">
          @if (runner().connected) {
            since {{ ago(runner().connectedSince) }}
          } @else {
            last seen {{ ago(runner().lastSeenAt) }}
          }
        </span>
        <span class="text-charcoal-brown-600">
          @if (runner().version) {
            v{{ runner().version }}
          } @else {
            version {{ none }}
          }
        </span>
        @if (updating()) {
          <ui-chip
            label="updating"
            tone="waiting"
            [attr.title]="'Rolling over to v' + runner().pinnedVersion"
          />
        }
        @if (runner().quarantined) {
          <ui-chip label="quarantined" tone="failed" />
        }
        <span class="ml-auto"><ui-action-button [action]="menuToggle()" /></span>
      </div>
      @if (runner().description) {
        <p class="m-0 text-charcoal-brown-700">{{ runner().description }}</p>
      }
      @if (runner().quarantined) {
        <p class="m-0 text-cinnabar-700">
          Quarantined: {{ quarantineReason() }}, since {{ ago(runner().quarantinedAt) }}. It takes
          no new workspaces until it is greenlit.
        </p>
      }

      <section class="flex flex-col gap-1" aria-label="Slots">
        <p class="m-0 flex flex-wrap gap-x-3 text-charcoal-brown-700">
          <span class="font-semibold"
            >{{ runner().running }}/{{ runner().slots }} slots running</span
          >
          <span>{{ runner().owned }} owned</span>
          <span>{{ runner().queued }} queued</span>
          <span>{{ memory() }}</span>
          @if (swap(); as swap) {
            <span>{{ swap }}</span>
          }
        </p>
        @if (slots().length) {
          <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
            @for (slot of slots(); track slot.id) {
              <li>
                <a
                  class="flex items-center gap-2 rounded-md border border-charcoal-brown-200 px-2 py-1 text-charcoal-brown-900 no-underline hover:shadow-md"
                  [routerLink]="slotLink(slot.id)"
                >
                  <span class="font-mono font-semibold">{{ slot.workspaceId }}</span>
                  <ui-chip [label]="runtime(slot.runtimeStatus)" />
                </a>
              </li>
            }
          </ul>
        } @else {
          <p class="m-0 text-charcoal-brown-500">None of this project’s workspaces run here.</p>
        }
      </section>

      <section class="flex flex-col gap-2" aria-label="Agent login">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="font-semibold text-charcoal-brown-800">Agent login on this node</span>
          @if (runner().login; as login) {
            <span class="flex items-center gap-1"
              >Claude
              <ui-chip [label]="presence(login.claude).label" [tone]="presence(login.claude).tone"
            /></span>
            <span class="flex items-center gap-1"
              >Kimi
              <ui-chip [label]="presence(login.kimi).label" [tone]="presence(login.kimi).tone"
            /></span>
            <span class="text-charcoal-brown-600">checked {{ ago(login.checkedAt) }}</span>
          } @else {
            <span class="text-charcoal-brown-600">not reported yet</span>
          }
          <ui-action-button [action]="recheck()" />
        </div>
        @if (runner().loginCommand || runner().kimiLoginCommand) {
          <p class="m-0 text-charcoal-brown-600">
            Log in once on the node; every workspace on this runner shares it. The platform never
            sees the secret.
          </p>
          @if (runner().loginCommand; as command) {
            <app-copy-text [text]="command" label="Copy Claude login" />
          }
          @if (runner().kimiLoginCommand; as command) {
            <app-copy-text [text]="command" label="Copy Kimi login" />
          }
        } @else if (runner().loginCommandPending) {
          <p class="m-0 text-charcoal-brown-600">
            The runner is still fetching the workspace image. The login command appears here once it
            is on the node.
          </p>
        } @else {
          <p class="m-0 text-charcoal-brown-600">
            The login command appears once the runner has reported its node volume.
          </p>
        }
        @if (loginError(); as message) {
          <p class="m-0 text-cinnabar-700" role="alert">{{ message }}</p>
        }
      </section>

      <section class="flex flex-col gap-2" aria-label="Health check">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="font-semibold text-charcoal-brown-800">Last health check</span>
          @if (health(); as badge) {
            <ui-chip [label]="badge.label" [tone]="badge.tone" />
            <span class="text-charcoal-brown-600">{{ ago(healthAt()) }}</span>
          } @else {
            <span class="text-charcoal-brown-600">not checked yet</span>
          }
          <ui-action-button [action]="runCheck()" />
          <ui-action-button [action]="detailsToggle()" />
        </div>
        @if (checks().length) {
          <ul class="m-0 flex list-none flex-col gap-1 p-0">
            @for (check of checks(); track check.name) {
              <li class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-charcoal-brown-800">{{ check.name }}</span>
                <ui-chip [label]="check.badge.label" [tone]="check.badge.tone" />
                <span class="text-charcoal-brown-600">{{ check.detail }}</span>
              </li>
            }
          </ul>
        }
        @if (healthcheckError(); as message) {
          <p class="m-0 text-cinnabar-700" role="alert">{{ message }}</p>
        }
        @if (detailsOpen()) {
          <div
            class="flex flex-col gap-2 rounded-md bg-charcoal-brown-50 px-3 py-2"
            aria-label="Node details"
            role="region"
          >
            @switch (details()?.status) {
              @case ('loaded') {
                @for (check of detailChecks(); track check.name) {
                  <div class="flex flex-col gap-1">
                    <span class="flex items-center gap-2">
                      <span class="font-mono font-semibold text-charcoal-brown-800">{{
                        check.name
                      }}</span>
                      <ui-chip [label]="check.badge.label" [tone]="check.badge.tone" />
                    </span>
                    @if (check.entries.length) {
                      <dl class="m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
                        @for (entry of check.entries; track entry[0]) {
                          <dt class="font-mono text-charcoal-brown-600">{{ entry[0] }}</dt>
                          <dd class="m-0 font-mono break-all text-charcoal-brown-900">
                            {{ entry[1] }}
                          </dd>
                        }
                      </dl>
                    }
                  </div>
                }
              }
              @case ('none') {
                <p class="m-0 text-charcoal-brown-600">
                  No health check has reached the service yet.
                </p>
              }
              @case ('error') {
                <p class="m-0 text-cinnabar-700" role="alert">
                  Could not load the node details.
                  <button
                    type="button"
                    class="cursor-pointer border-0 bg-transparent p-0 text-cinnabar-700 underline"
                    (click)="loadDetails(true)"
                  >
                    Try again
                  </button>
                </p>
              }
              @default {
                <p class="m-0 text-charcoal-brown-600">Loading node details…</p>
              }
            }
          </div>
        }
      </section>

      @if (menuOpen()) {
        <section
          class="flex flex-col gap-2 border-t border-charcoal-brown-200 pt-3"
          aria-label="Runner actions"
        >
          @if (draft(); as draft) {
            <div class="flex flex-wrap items-start gap-3">
              <label class="flex flex-col gap-1">
                <span class="font-semibold text-charcoal-brown-700">Slots</span>
                <input
                  [class]="inputClass + ' w-20'"
                  type="number"
                  min="0"
                  [value]="draft.slots"
                  (input)="edit({ slots: $any($event.target).valueAsNumber })"
                />
                <span class="text-charcoal-brown-500">0 = take no new workspaces.</span>
              </label>
              <label class="flex flex-col gap-1">
                <span class="font-semibold text-charcoal-brown-700">Description</span>
                <input
                  [class]="inputClass + ' w-56'"
                  type="text"
                  [value]="draft.description"
                  (input)="edit({ description: $any($event.target).value })"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="font-semibold text-charcoal-brown-700">Workspace memory</span>
                <input
                  [class]="inputClass + ' w-28 font-mono'"
                  type="text"
                  placeholder="8g"
                  [value]="draft.memory"
                  (input)="edit({ memory: $any($event.target).value })"
                />
                <span class="text-charcoal-brown-500">Blank: platform default.</span>
              </label>
              <label class="flex flex-col gap-1">
                <span class="font-semibold text-charcoal-brown-700">Workspace memory + swap</span>
                <input
                  [class]="inputClass + ' w-28 font-mono'"
                  type="text"
                  placeholder="8g"
                  [value]="draft.swap"
                  (input)="edit({ swap: $any($event.target).value })"
                />
                <span class="max-w-56 text-charcoal-brown-500"
                  >Total incl. memory; blank: no swap beyond the memory cap; -1: unlimited
                  swap.</span
                >
              </label>
            </div>
            <div class="flex flex-wrap gap-2">
              <ui-action-button [action]="save()" />
              <ui-action-button [action]="cancelEdit" />
            </div>
          } @else {
            <div class="flex flex-wrap items-center gap-2">
              <ui-action-button [action]="startEdit" />
              <ui-action-button [action]="rotate()" />
              @if (runner().quarantined) {
                <ui-action-button [action]="greenlight()" />
              }
              <ui-action-button [action]="remove()" />
              @if (confirmingDelete()) {
                <ui-action-button [action]="keep" />
              }
            </div>
          }
          @if (owners(); as owners) {
            <div
              class="flex flex-col gap-1 rounded-md border border-cinnabar-200 bg-cinnabar-50 px-3 py-2 text-cinnabar-800"
              role="alert"
            >
              <p class="m-0">
                This runner still owns {{ owners.length }}
                {{ owners.length === 1 ? 'workspace' : 'workspaces' }}. A workspace is sticky to its
                runner, so resolve these first:
              </p>
              <ul class="m-0 pl-5">
                @for (owner of owners; track owner.id) {
                  <li>
                    @if (owner.link; as link) {
                      <a class="text-cinnabar-800" [routerLink]="link">{{ owner.label }}</a>
                    } @else {
                      {{ owner.label }}
                    }
                  </li>
                }
              </ul>
            </div>
          }
          @if (rowError(); as message) {
            <p class="m-0 text-cinnabar-700" role="alert">{{ message }}</p>
          }
        </section>
      }
    </article>
  `,
})
export class RunnerCard {
  private readonly store = inject(RunnersStore);

  readonly runner = input.required<Runner>();
  /** The project's slots placed on this runner. */
  readonly slots = input<readonly RunnerSlot[]>([]);
  /** The project's slug, for the slots' addresses. */
  readonly slug = input<string | undefined>(undefined);
  /** The clock the "ago" labels are read against. */
  readonly now = input<Date>(new Date());

  /** A write was answered (or refused): the page reads the list again. */
  readonly changed = output<void>();
  /** A rotated token's one-time install line, for the page to show. */
  readonly registration = output<RunnerRegistration>();

  protected readonly none = NONE;
  protected readonly inputClass = INPUT;
  protected readonly presence = presenceOf;

  protected readonly menuOpen = signal(false);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly busy = signal<Busy>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  protected readonly owners = signal<readonly Owner[] | null>(null);
  protected readonly loginError = signal<string | null>(null);
  protected readonly healthcheckError = signal<string | null>(null);
  protected readonly detailsOpen = signal(false);
  /**
   * The health check's instant seen when Run health check was pressed (null: none yet), or
   * undefined when nothing is pending. The button stays pressed until a newer check lands.
   */
  private readonly pendingSince = signal<string | null | undefined>(undefined);

  protected readonly connectivity = computed(() => connectivityOf(this.runner()));
  protected readonly updating = computed(() => isUpdating(this.runner()));
  protected readonly quarantineReason = computed(() => quarantineReasonOf(this.runner()));
  protected readonly memory = computed(() => memoryOf(this.runner()));
  protected readonly swap = computed(() => swapOf(this.runner()));
  protected readonly health = computed(() => healthBadgeOf(this.runner()));
  protected readonly healthAt = computed(() => healthAtOf(this.runner()));
  protected readonly checks = computed(() => (this.runner().health?.checks ?? []).map(checkLineOf));
  protected readonly checking = computed(() => {
    const since = this.pendingSince();
    return since !== undefined && since === this.healthAt();
  });

  protected readonly details = computed(() => this.store.healthOf(this.id()));
  protected readonly detailChecks = computed(() =>
    (this.details()?.checks ?? []).map((check) => ({
      ...checkLineOf(check),
      entries: dataEntriesOf(check.data),
    })),
  );

  protected readonly menuToggle = computed((): Action => ({
    label: this.menuOpen() ? 'Close actions' : 'Actions',
    variant: 'muted',
    callback: () => this.toggleMenu(),
  }));

  protected readonly recheck = computed((): Action => ({
    label: this.busy() === 'login' ? 'Re-checking…' : 'Re-check',
    variant: 'muted',
    disabled: this.busy() !== null,
    callback: () => void this.recheckLogin(),
  }));

  protected readonly runCheck = computed((): Action => ({
    label: this.checking() ? 'Health check queued…' : 'Run health check',
    variant: 'muted',
    disabled: this.checking(),
    callback: () => void this.runHealthCheck(),
  }));

  protected readonly detailsToggle = computed((): Action => ({
    label: this.detailsOpen() ? 'Hide node details' : 'Node details',
    variant: 'muted',
    callback: () => this.toggleDetails(),
  }));

  protected readonly startEdit: Action = {
    label: 'Edit',
    variant: 'muted',
    details: { items: ['Slots, description and the workspace memory caps.'] },
    callback: () => {
      const runner = this.runner();
      this.draft.set({
        slots: runner.slots ?? 0,
        description: runner.description ?? '',
        memory: runner.workspaceMemoryLimit ?? '',
        swap: runner.workspaceMemorySwapLimit ?? '',
      });
      this.rowError.set(null);
    },
  };

  protected readonly cancelEdit: Action = {
    label: 'Cancel',
    variant: 'muted',
    callback: () => {
      this.draft.set(null);
      this.rowError.set(null);
    },
  };

  protected readonly save = computed((): Action => ({
    label: this.busy() === 'save' ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: this.busy() !== null,
    callback: () => void this.saveEdit(),
  }));

  protected readonly rotate = computed((): Action => ({
    label: this.busy() === 'rotate' ? 'Rotating…' : 'Rotate token',
    variant: 'muted',
    disabled: this.busy() !== null,
    details: {
      items: [
        'Makes a new single-use registration token, and an install line with it.',
        'The old token stops working.',
      ],
    },
    callback: () => void this.rotateToken(),
  }));

  protected readonly greenlight = computed((): Action => ({
    label: this.busy() === 'greenlight' ? 'Greenlighting…' : 'Greenlight',
    variant: 'success',
    disabled: this.busy() !== null,
    details: { items: ['Lifts the quarantine: the runner takes new workspaces again.'] },
    callback: () => void this.liftQuarantine(),
  }));

  protected readonly remove = computed((): Action => ({
    label:
      this.busy() === 'delete'
        ? 'Deleting…'
        : this.confirmingDelete()
          ? 'Confirm delete?'
          : 'Delete',
    variant: this.confirmingDelete() ? 'danger' : 'muted',
    disabled: this.busy() !== null,
    callback: () => void this.pressDelete(),
  }));

  protected readonly keep: Action = {
    label: 'Keep it',
    variant: 'muted',
    callback: () => this.confirmingDelete.set(false),
  };

  protected ago(iso: string | null | undefined): string {
    return iso ? relativeSince(iso, this.now()) : NONE;
  }

  protected runtime(status: string | undefined): string {
    return runtimeLabel(status);
  }

  protected slotLink(id: number | undefined): string {
    return `/projects/${this.slug() ?? ''}/workspaces/${id ?? ''}`;
  }

  protected edit(change: Partial<Draft>): void {
    this.draft.update((draft) => (draft ? { ...draft, ...change } : draft));
  }

  protected loadDetails(again = false): void {
    void this.store.loadHealth(this.id(), again);
  }

  private id(): string {
    return this.runner().id ?? '';
  }

  private toggleMenu(): void {
    this.menuOpen.update((open) => !open);
    this.draft.set(null);
    this.rowError.set(null);
    this.confirmingDelete.set(false);
    this.owners.set(null);
  }

  private toggleDetails(): void {
    const open = !this.detailsOpen();
    this.detailsOpen.set(open);
    if (open) this.loadDetails();
  }

  private async recheckLogin(): Promise<void> {
    this.busy.set('login');
    this.loginError.set(null);
    const outcome = await this.store.requestLoginCheck(this.id());
    this.busy.set(null);
    if (!outcome.ok) {
      this.loginError.set(sentence(`Could not re-check — ${describeRefusal(outcome)}`));
    }
  }

  private async runHealthCheck(): Promise<void> {
    if (this.checking()) return;
    this.healthcheckError.set(null);
    this.pendingSince.set(this.healthAt());
    const outcome = await this.store.requestHealthcheck(this.id());
    if (!outcome.ok) {
      this.pendingSince.set(undefined);
      this.healthcheckError.set(
        sentence(`Could not run a health check — ${describeRefusal(outcome)}`),
      );
    }
  }

  private async saveEdit(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    const problem =
      slotsProblemOf(draft.slots) ||
      memoryLimitProblemOf(draft.memory) ||
      swapLimitProblemOf(draft.memory, draft.swap);
    if (problem) {
      this.rowError.set(problem);
      return;
    }
    const runner = this.runner();
    const memory = draft.memory.trim();
    const swap = draft.swap.trim();
    // The memory caps are sent only when they moved: a blank one clears it.
    const change: RunnerChange = {
      slots: draft.slots,
      description: draft.description,
      ...(memory !== (runner.workspaceMemoryLimit ?? '') ? { workspaceMemoryLimit: memory } : {}),
      ...(swap !== (runner.workspaceMemorySwapLimit ?? '')
        ? { workspaceMemorySwapLimit: swap }
        : {}),
    };
    const saved = await this.act('save', 'Could not save', () =>
      this.store.patchRunner(this.id(), change),
    );
    if (saved) this.draft.set(null);
  }

  private async rotateToken(): Promise<void> {
    const outcome = await this.run('rotate', () => this.store.rotateToken(this.id()));
    if (outcome.ok) {
      this.menuOpen.set(false);
      this.registration.emit(outcome.value);
    } else {
      this.rowError.set(
        sentence(`Could not rotate the registration token — ${describeRefusal(outcome)}`),
      );
    }
  }

  private async liftQuarantine(): Promise<void> {
    await this.act('greenlight', 'Could not greenlight this runner', () =>
      this.store.greenlight(this.id()),
    );
  }

  private async pressDelete(): Promise<void> {
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      this.rowError.set(null);
      this.owners.set(null);
      return;
    }
    this.busy.set('delete');
    this.rowError.set(null);
    this.owners.set(null);
    const outcome = await this.store.deleteRunner(this.id());
    this.busy.set(null);
    this.confirmingDelete.set(false);
    if (outcome.ok) {
      this.menuOpen.set(false);
    } else if (outcome.code === RUNNER_OWNS_WORKSPACES && outcome.workspaceIds) {
      this.owners.set(outcome.workspaceIds.map((id) => this.ownerOf(id)));
    } else {
      this.rowError.set(sentence(`Could not delete this runner — ${describeRefusal(outcome)}`));
    }
    this.changed.emit();
  }

  /** A workspace the refusal named: a link to its slot page when it is one of the project's. */
  private ownerOf(id: number): Owner {
    const slot = this.slots().find((s) => s.id === id);
    return slot
      ? { id, label: slot.workspaceId ?? `workspace #${id}`, link: this.slotLink(id) }
      : { id, label: `workspace #${id}`, link: null };
  }

  /** One verb: busy while it runs, the refusal said, and `changed` either way. */
  private async act(
    verb: Exclude<Busy, null>,
    failure: string,
    call: () => Promise<ActionOutcome<unknown>>,
  ): Promise<boolean> {
    const outcome = await this.run(verb, call);
    if (!outcome.ok) this.rowError.set(sentence(`${failure} — ${describeRefusal(outcome)}`));
    return outcome.ok;
  }

  private async run<T>(
    verb: Exclude<Busy, null>,
    call: () => Promise<ActionOutcome<T>>,
  ): Promise<ActionOutcome<T>> {
    this.busy.set(verb);
    this.rowError.set(null);
    const outcome = await call();
    this.busy.set(null);
    this.changed.emit();
    return outcome;
  }
}
