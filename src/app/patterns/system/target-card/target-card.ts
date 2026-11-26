import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  outcomes,
  QitsEntity,
  QitsEntityList,
  QitsField,
  qitsMutation,
  qitsResource,
  stay,
} from '@qits/angular';
import { payloadField } from '$core/events/refresh-on';
import { formatInstant, formatRelativeTime } from '$core/release-requests/release-request-model';
import { loadState } from '$core/resources/load-state';
import type { TargetLease } from '$core/system/leases.consumes';
import { TARGET_LEASES } from '$core/system/leases.operations';
import { HARNESSES } from '$core/system/sign-in';
import { targetHealthOf } from '$core/system/target-health';
import {
  explainTargetRefusal,
  isSlotsRefusal,
  targetRefusalOf,
} from '$core/system/target-refusals';
import {
  draftOf,
  loginCommandOf,
  loginOf,
  loginTone,
  memoryLine,
  optionalSlots,
  SLOT_TYPES,
  slotLines,
  slotsInUse,
  targetPatch,
  type SlotType,
  type TargetDraft,
} from '$core/system/target-rows';
import type { TargetRow } from '$core/system/targets.consumes';
import {
  TARGET_DELETE,
  TARGET_GREENLIGHT,
  TARGET_HEALTH,
  TARGET_HEALTH_CHECK,
  TARGET_LOGIN_CHECK,
  TARGET_PATCH,
  TARGET_TOKEN_ROTATE,
} from '$core/system/targets.operations';
import { CopyText } from '$patterns/workspaces/copy-text/copy-text';
import { TargetSignIn } from '$patterns/system/target-sign-in/target-sign-in';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * One execution target on the Targets page (qits-2351, `li[app-target-card]`), as `TARGET_ROWS`
 * answered it: the page hands each card its row, so what the card shows is traced to the client's
 * answer and carries the data marks (the card is the target by `id`, each value its field or the
 * fields it is derived from, `MARKS`).
 *
 * - Header: name, description, the runner's hostname.
 * - Connection: Connected / Disconnected, since when or when last seen, the runner's version.
 * - Quarantine: a Quarantined chip with its reason and time, and **Greenlight**
 *   (`greenlight-target`), drawn only while quarantined.
 * - Slots: used of the total, then per type used, reserved and maximum (`—`: no ceiling).
 * - Sign-in: each harness's PRESENT / ABSENT / UNKNOWN, when it was checked, **Check sign-in**
 *   (`request-target-login-check`; its answer arrives as `TargetLoginChanged`), each harness's
 *   sign-in flow (`app-target-sign-in`) and its manual command (`loginCommand`,
 *   `kimiLoginCommand`) behind a disclosure, with Copy.
 * - Health: the last check passed or failed and when, **Run health check**
 *   (`request-target-health-check`), and Details, which read `TARGET_HEALTH` on opening: each check,
 *   or "No health check has settled yet." on a 204.
 * - Memory: the node's and the host's OOM kills and the memory limit, only while reported.
 * - Leases: a disclosure reading this target's leases (`TARGET_LEASES`, `listLeases?targetId=`) on
 *   opening, again after a `TargetLeaseChanged` naming it.
 * - **Edit** (`edit-target`): the description and reservations, Save sends only what changed. A
 *   `SLOTS_EXCEED_MEMORY` refusal (qits-2581) is said under "Reserved slots", in the service's
 *   words, and the draft stays open to be corrected.
 * - **Rotate registration token** (`rotate-target-token`): an optional slots total (0..1024,
 *   checked here), then the new one-time install line.
 * - **Delete** (`ask-delete-target`, `delete-target`): asked on the first press, sent on the second,
 *   never queued offline; a `TARGET_BUSY` refusal opens the leases that hold it.
 *
 * Every refusal is said on the card (`target-refusals.ts`). After each write the card asks the
 * page to read the targets again (`changed`): create, patch, greenlight, token rotation and a
 * health check's result publish no event.
 */
@Component({
  selector: 'li[app-target-card]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    CopyText,
    QitsEntity,
    QitsEntityList,
    QitsField,
    Spinner,
    TargetSignIn,
  ],
  host: { class: 'block rounded-md border border-line bg-surface px-4 py-3' },
  template: `
    @let row = target();
    <article
      class="flex flex-col gap-3"
      [qitsEntity]="row"
      entityKey="id"
      [attr.aria-label]="row.name"
    >
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="m-0 text-base font-semibold text-fg" [fieldOf]="row" qitsField="name">
          {{ row.name }}
        </h2>
        <ui-chip
          [label]="row.connected ? 'Connected' : 'Disconnected'"
          [tone]="row.connected ? 'ok' : 'neutral'"
          [fieldOf]="row"
          [qitsField]="marks.connected"
        />
        @if (row.quarantined) {
          <ui-chip
            label="Quarantined"
            tone="failed"
            [fieldOf]="row"
            [qitsField]="marks.quarantined"
          />
        }
        <span class="font-mono text-xs text-fg-soft" [fieldOf]="row" [qitsField]="marks.hostname">
          {{ row.hostname || 'no hostname yet' }}
        </span>
      </header>
      @if (row.description) {
        <p class="m-0 text-sm text-fg-soft" [fieldOf]="row" qitsField="description">
          {{ row.description }}
        </p>
      }
      <p class="m-0 text-sm text-fg-soft" [fieldOf]="row" [qitsField]="marks.connection">
        {{ connection() }}
      </p>

      @if (row.quarantined) {
        <div class="flex flex-wrap items-center gap-2 text-sm" data-quarantine>
          <span class="text-fg" [fieldOf]="row" [qitsField]="marks.quarantine">{{
            quarantine()
          }}</span>
          <ui-action-button [action]="greenlight()" />
        </div>
      }

      <section class="flex flex-col gap-1" [attr.aria-label]="row.name + ' slots'">
        <h3 class="m-0 text-sm font-semibold text-fg" [fieldOf]="row" [qitsField]="marks.inUse">
          Slots · {{ inUse() }}
        </h3>
        <table class="w-full max-w-md border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-line text-xs text-fg-muted">
              <th class="py-1 pr-3 font-semibold">Type</th>
              <th class="py-1 pr-3 font-semibold">Used</th>
              <th class="py-1 pr-3 font-semibold">Reserved</th>
              <th class="py-1 font-semibold">Maximum</th>
            </tr>
          </thead>
          <tbody>
            @for (line of slots(); track line.type) {
              <tr class="border-b border-line-subtle" [fieldOf]="row" [qitsField]="marks.slots">
                <td class="py-1 pr-3 font-mono">{{ line.type }}</td>
                <td class="py-1 pr-3 tabular-nums">{{ line.used }}</td>
                <td class="py-1 pr-3 tabular-nums">{{ line.reserved }}</td>
                <td class="py-1 tabular-nums">{{ line.maximum }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="flex flex-col gap-2" [attr.aria-label]="row.name + ' sign-in'">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="m-0 text-sm font-semibold text-fg">Sign-in</h3>
          <span class="text-xs text-fg-soft" [fieldOf]="row" [qitsField]="marks.checked">{{
            checked()
          }}</span>
          <ui-action-button [action]="loginCheck()" />
        </div>
        @for (harness of harnesses; track harness) {
          <div class="flex flex-col gap-1.5 border-l-2 border-line pl-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm text-fg">{{ harness }}</span>
              <ui-chip
                [label]="loginOf(row, harness)"
                [tone]="loginTone(loginOf(row, harness))"
                [fieldOf]="row"
                [qitsField]="marks.login"
              />
            </div>
            <app-target-sign-in
              [targetId]="row.id ?? ''"
              [harness]="harness"
              [connected]="!!row.connected"
              [login]="loginOf(row, harness)"
              (signedIn)="changed.emit()"
            />
            @if (commandOf(row, harness); as command) {
              <details class="text-sm">
                <summary class="cursor-pointer text-fg-soft">Sign in by hand on the node</summary>
                <app-copy-text
                  class="mt-1"
                  [text]="command"
                  label="Copy command"
                  [fieldOf]="row"
                  [qitsField]="marks.command"
                />
              </details>
            }
          </div>
        }
      </section>

      <section class="flex flex-col gap-2" [attr.aria-label]="row.name + ' health'">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="m-0 text-sm font-semibold text-fg">Health</h3>
          @if (row.lastHealthCheckAt) {
            <ui-chip
              [label]="row.lastHealthCheckOk ? 'Passed' : 'Failed'"
              [tone]="row.lastHealthCheckOk ? 'ok' : 'failed'"
              [fieldOf]="row"
              [qitsField]="marks.health"
            />
          }
          <span class="text-xs text-fg-soft" [fieldOf]="row" [qitsField]="marks.healthAt">{{
            healthAt()
          }}</span>
          <ui-action-button [action]="healthCheck()" />
          <button
            type="button"
            class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent"
            [attr.aria-expanded]="healthOpen()"
            (click)="healthOpen.set(!healthOpen())"
          >
            Details
          </button>
        </div>
        @if (healthOpen()) {
          <ui-spinner [state]="healthState()" class="min-h-8" data-health>
            @if (healthRead.status() === 'error') {
              <p class="m-0 text-sm text-danger" role="alert">
                The last health check could not be read.
              </p>
            } @else if (health(); as report) {
              <ul
                class="m-0 flex list-none flex-col gap-1 p-0 text-sm"
                [qitsEntityList]="healthRead"
              >
                @for (check of report.checks; track check.name) {
                  <li
                    class="flex flex-wrap items-baseline gap-2"
                    [fieldOf]="report"
                    [qitsField]="marks.check"
                  >
                    <ui-chip
                      [label]="check.ok ? 'Passed' : 'Failed'"
                      [tone]="check.ok ? 'ok' : 'failed'"
                    />
                    <span class="font-mono">{{ check.name }}</span>
                    @if (check.detail) {
                      <span class="text-fg-soft">{{ check.detail }}</span>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="m-0 text-sm text-fg-soft" role="status">No health check has settled yet.</p>
            }
          </ui-spinner>
        }
      </section>

      @if (memory(); as line) {
        <p class="m-0 text-sm text-fg-soft" [fieldOf]="row" [qitsField]="marks.memory">
          Memory: {{ line }}
        </p>
      }

      <section class="flex flex-col gap-2" [attr.aria-label]="row.name + ' leases'">
        <div>
          <button
            type="button"
            class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent"
            [attr.aria-expanded]="leasesOpen()"
            (click)="leasesOpen.set(!leasesOpen())"
          >
            Leases
          </button>
        </div>
        @if (leasesOpen()) {
          <ui-spinner [state]="leasesState()" class="min-h-8" data-leases>
            @if (leases.status() === 'error') {
              <p class="m-0 text-sm text-danger" role="alert">
                This target’s leases could not be read.
              </p>
            } @else if (leaseRows().length === 0) {
              <p class="m-0 text-sm text-fg-soft" role="status">This target holds no leases.</p>
            } @else {
              <table
                class="w-full border-collapse text-left text-sm"
                [attr.aria-label]="row.name + ' leases'"
              >
                <thead>
                  <tr class="border-b border-line text-xs text-fg-muted">
                    <th class="py-1 pr-3 font-semibold">Slot</th>
                    <th class="py-1 pr-3 font-semibold">Owner</th>
                    <th class="py-1 pr-3 font-semibold">Ref</th>
                    <th class="py-1 pr-3 font-semibold">State</th>
                    <th class="py-1 font-semibold">Detail</th>
                  </tr>
                </thead>
                <tbody [qitsEntityList]="leases">
                  @for (lease of leaseRows(); track lease.id) {
                    <tr
                      class="border-b border-line-subtle align-top"
                      [qitsEntity]="lease"
                      entityKey="id"
                    >
                      <td class="py-1 pr-3 font-mono" [fieldOf]="lease" qitsField="slotType">
                        {{ lease.slotType }}
                      </td>
                      <td class="py-1 pr-3" [fieldOf]="lease" qitsField="ownerApp">
                        {{ lease.ownerApp }}
                      </td>
                      <td
                        class="py-1 pr-3 font-mono text-xs break-all"
                        [fieldOf]="lease"
                        qitsField="ownerRef"
                      >
                        {{ lease.ownerRef }}
                      </td>
                      <td class="py-1 pr-3" [fieldOf]="lease" qitsField="state">
                        {{ lease.state }}
                      </td>
                      <td
                        class="py-1 text-fg-soft"
                        [fieldOf]="lease"
                        [qitsField]="marks.leaseDetail"
                      >
                        {{ lease.detail || '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </ui-spinner>
        }
      </section>

      @if (editing(); as draft) {
        <form
          class="flex max-w-xl flex-col gap-2 rounded-md border border-line bg-surface-muted p-3"
          [attr.aria-label]="'Edit ' + row.name"
          (submit)="$event.preventDefault(); save()"
        >
          <label class="flex flex-col gap-1 text-sm text-fg">
            Description
            <input
              class="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm"
              type="text"
              name="description"
              [value]="draft.description"
              (input)="edit({ description: text($event) })"
            />
          </label>
          <fieldset
            class="m-0 flex flex-wrap gap-3 border-0 p-0"
            [attr.aria-describedby]="slotsRefusal() ? slotsRefusalId() : null"
          >
            <legend class="mb-1 text-sm text-fg">Reserved slots</legend>
            @for (type of slotTypes; track type) {
              <label class="flex flex-col gap-1 text-xs text-fg-soft">
                {{ type }}
                <input
                  class="h-8 w-20 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg"
                  type="text"
                  inputmode="numeric"
                  [name]="'reserved-' + type"
                  [value]="draft.reservations[type]"
                  [attr.aria-invalid]="slotsRefusal() ? 'true' : null"
                  (input)="reserve(type, text($event))"
                />
              </label>
            }
          </fieldset>
          @if (slotsRefusal(); as said) {
            <p class="m-0 text-sm text-danger" role="alert" [id]="slotsRefusalId()">{{ said }}</p>
          }
          <div class="flex flex-wrap gap-2">
            <ui-action-button [action]="saveAction()" [fieldOf]="row" [qitsField]="marks.save" />
            <ui-action-button [action]="cancelEdit()" />
          </div>
        </form>
      }

      @if (rotating()) {
        <form
          class="flex max-w-xl flex-col gap-2 rounded-md border border-line bg-surface-muted p-3"
          [attr.aria-label]="'Rotate the registration token of ' + row.name"
          (submit)="$event.preventDefault(); rotate()"
        >
          <label class="flex flex-col gap-1 text-sm text-fg">
            Slots total for the install line (optional, 0–1024)
            <input
              class="h-8 w-28 rounded-md border border-line-strong bg-surface px-2 text-sm"
              type="text"
              inputmode="numeric"
              name="slots"
              [value]="rotateSlots()"
              (input)="rotateSlots.set(text($event))"
            />
          </label>
          @if (rotateSlotsInvalid()) {
            <p class="m-0 text-xs text-danger">Slots is a whole number from 0 to 1024.</p>
          }
          <div class="flex flex-wrap gap-2">
            <ui-action-button [action]="rotateAction()" />
            <ui-action-button [action]="cancelRotate()" />
          </div>
        </form>
      }

      @if (installLine(); as line) {
        <div
          class="flex flex-col gap-2 rounded-md border border-line bg-surface-muted p-3"
          data-install-line
        >
          <p class="m-0 text-sm text-fg">
            Run this on the target’s node. The token in it works once and is lost when you leave
            this page; rotating the token again gives a new one.
          </p>
          <app-copy-text [text]="line" label="Copy install line" />
        </div>
      }

      <div class="flex flex-wrap gap-2">
        @if (!editing() && !rotating()) {
          <ui-action-button [action]="openEdit()" />
          <ui-action-button [action]="openRotate()" />
        }
        @if (confirmingDelete()) {
          <ui-action-button
            [action]="deleteAction()"
            [fieldOf]="row"
            [qitsField]="marks.deleteLabel"
          />
          <ui-action-button [action]="keep()" />
        } @else {
          <ui-action-button [action]="askDelete()" />
        }
      </div>

      @if (note(); as note) {
        <p class="m-0 text-sm text-fg-soft" role="status">{{ note }}</p>
      }
      @if (refusal(); as refusal) {
        <p class="m-0 text-sm text-danger" role="alert">{{ refusal }}</p>
      }
    </article>
  `,
})
export class TargetCard {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The target, as `TARGET_ROWS` answered it. */
  readonly target = input.required<TargetRow>();

  /** A write landed, or a sign-in succeeded: the page reads the targets again. */
  readonly changed = output<void>();

  protected readonly editingOutcome = outcomes('edit-target', { sent: stay() });
  protected readonly rotatingOutcome = outcomes('rotate-target-token', { sent: stay() });
  protected readonly greenlighting = outcomes('greenlight-target', { sent: stay() });
  protected readonly asking = outcomes('ask-delete-target', { asked: stay(), kept: stay() });
  protected readonly deleting = outcomes('delete-target', { deleted: stay(), refused: stay() });
  protected readonly checkingHealth = outcomes('request-target-health-check', { sent: stay() });
  protected readonly checkingLogin = outcomes('request-target-login-check', { sent: stay() });

  private readonly patchRun = qitsMutation(TARGET_PATCH, { offline: 'online-only' });
  private readonly rotateRun = qitsMutation(TARGET_TOKEN_ROTATE, { offline: 'online-only' });
  private readonly greenlightRun = qitsMutation(TARGET_GREENLIGHT, { offline: 'online-only' });
  private readonly deleteRun = qitsMutation(TARGET_DELETE, { offline: 'online-only' });
  private readonly healthCheckRun = qitsMutation(TARGET_HEALTH_CHECK, { offline: 'online-only' });
  private readonly loginCheckRun = qitsMutation(TARGET_LOGIN_CHECK, { offline: 'online-only' });

  protected readonly harnesses = HARNESSES;
  protected readonly slotTypes = SLOT_TYPES;
  protected readonly marks = MARKS;
  protected readonly loginOf = loginOf;
  protected readonly loginTone = loginTone;
  protected readonly commandOf = loginCommandOf;

  /** The health Details are open: the last settled check is read. */
  protected readonly healthOpen = signal(false);
  /** The Leases are open: this target's leases are read. */
  protected readonly leasesOpen = signal(false);
  /** The Edit's draft while it is open. */
  protected readonly editing = signal<TargetDraft | null>(null);
  /** The Rotate form is open. */
  protected readonly rotating = signal(false);
  protected readonly rotateSlots = signal('');
  /** The install line the last rotation answered, shown once. */
  protected readonly installLine = signal<string | null>(null);
  /** Delete waits for its second press. */
  protected readonly confirmingDelete = signal(false);
  /** A write is on its way. */
  protected readonly busy = signal(false);
  /** What the last write came to, when it was taken. */
  protected readonly note = signal<string | null>(null);
  /** Why the last write was refused, in the page's words. */
  protected readonly refusal = signal<string | null>(null);
  /**
   * Why the last Save's slot settings were refused (`SLOTS_EXCEED_MEMORY`, qits-2581): said under
   * "Reserved slots", never again at the bottom of the card.
   */
  protected readonly slotsRefusal = signal<string | null>(null);

  private readonly id = computed(() => this.target().id ?? '');

  /** The id the reserved slots' fieldset is described by while its refusal shows. */
  protected readonly slotsRefusalId = computed(() => `target-slots-refusal-${this.id()}`);

  /** The last settled health check, read when Details open. */
  protected readonly healthRead = qitsResource(TARGET_HEALTH, () =>
    this.browser && this.healthOpen() && this.id() ? { path: { id: this.id() } } : undefined,
  );

  /** This target's leases, read when Leases open; again after a lease of it changed. */
  protected readonly leases = qitsResource(
    TARGET_LEASES,
    () =>
      this.browser && this.leasesOpen() && this.id()
        ? { query: { targetId: this.id() } }
        : undefined,
    {
      refreshOn: {
        names: ['TargetLeaseChanged'],
        when: (event) => payloadField(event, 'targetId') === this.id(),
        debounceMs: 1_000,
      },
    },
  );

  protected readonly leaseRows = computed(
    (): readonly TargetLease[] => (this.leases.hasValue() ? this.leases.value() : []) ?? [],
  );

  protected readonly leasesState = computed(() => loadState(this.leases));

  /** The health read's report; undefined for a 204 (none settled yet) or while it reads. */
  protected readonly health = computed(() =>
    this.healthRead.status() === 'resolved' || this.healthRead.status() === 'local'
      ? targetHealthOf(this.healthRead.value())
      : undefined,
  );

  /** A 204 answers no value: the read is settled, not loading. */
  protected readonly healthState = computed(() => {
    const status = this.healthRead.status();
    if (status === 'error') return 'error';
    return status === 'resolved' || status === 'local' || this.healthRead.hasValue()
      ? 'loaded'
      : 'loading';
  });

  protected readonly connection = computed(() => {
    const row = this.target();
    const version = row.runnerVersion ? ` · runner ${row.runnerVersion}` : '';
    if (row.connected) return `Connected since ${formatRelativeTime(row.connectedSince)}${version}`;
    return row.lastSeenAt
      ? `Last seen ${formatRelativeTime(row.lastSeenAt)}${version}`
      : `Never connected${version}`;
  });

  protected readonly quarantine = computed(() => {
    const row = this.target();
    return `Quarantined: ${row.quarantineReason || 'no reason given'}, since ${formatInstant(row.quarantinedAt)}.`;
  });

  protected readonly inUse = computed(() => slotsInUse(this.target()));
  protected readonly slots = computed(() => slotLines(this.target()));
  protected readonly memory = computed(() => memoryLine(this.target()));

  protected readonly checked = computed(() => {
    const at = this.target().login?.checkedAt;
    return at ? `checked ${formatRelativeTime(at)}` : 'never checked';
  });

  protected readonly healthAt = computed(() => {
    const at = this.target().lastHealthCheckAt;
    return at ? `last checked ${formatRelativeTime(at)}` : 'no health check yet';
  });

  protected readonly rotateSlotsInvalid = computed(
    () => optionalSlots(this.rotateSlots()) === false,
  );

  protected readonly greenlight = computed((): Action => ({
    label: 'Greenlight',
    variant: 'success',
    disabled: this.busy(),
    outcomes: [this.greenlighting.sent],
    callback: () => void this.lift(),
  }));

  protected readonly loginCheck = computed((): Action => ({
    label: 'Check sign-in',
    variant: 'muted',
    disabled: this.busy(),
    outcomes: [this.checkingLogin.sent],
    callback: () => void this.checkLogin(),
  }));

  protected readonly healthCheck = computed((): Action => ({
    label: 'Run health check',
    variant: 'muted',
    disabled: this.busy(),
    outcomes: [this.checkingHealth.sent],
    callback: () => void this.checkHealth(),
  }));

  protected readonly openEdit = computed((): Action => ({
    label: 'Edit',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.startEdit(),
  }));

  protected readonly saveAction = computed((): Action => ({
    label: this.busy() ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: this.busy() || !this.patch(),
    outcomes: [this.editingOutcome.sent],
    callback: () => void this.save(),
  }));

  protected readonly cancelEdit = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => {
      this.editing.set(null);
      this.slotsRefusal.set(null);
    },
  }));

  protected readonly openRotate = computed((): Action => ({
    label: 'Rotate registration token',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => {
      this.rotating.set(true);
      this.rotateSlots.set('');
      this.refusal.set(null);
      this.note.set(null);
    },
  }));

  protected readonly rotateAction = computed((): Action => ({
    label: this.busy() ? 'Rotating…' : 'Rotate',
    variant: 'success',
    disabled: this.busy() || this.rotateSlotsInvalid(),
    outcomes: [this.rotatingOutcome.sent],
    callback: () => void this.rotate(),
  }));

  protected readonly cancelRotate = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.busy(),
    callback: () => this.rotating.set(false),
  }));

  protected readonly askDelete = computed((): Action => ({
    label: 'Delete…',
    variant: 'danger',
    disabled: this.busy(),
    outcomes: [this.asking.asked],
    callback: () => {
      this.confirmingDelete.set(true);
      this.refusal.set(null);
      this.asking.asked.reach();
    },
  }));

  protected readonly deleteAction = computed((): Action => ({
    label: this.busy() ? 'Deleting…' : `Delete ${this.target().name ?? 'this target'}`,
    variant: 'danger',
    disabled: this.busy(),
    outcomes: [this.deleting.deleted, this.deleting.refused],
    callback: () => void this.remove(),
  }));

  protected readonly keep = computed((): Action => ({
    label: 'Keep it',
    variant: 'muted',
    disabled: this.busy(),
    outcomes: [this.asking.kept],
    callback: () => {
      this.confirmingDelete.set(false);
      this.asking.kept.reach();
    },
  }));

  /** What Save would send; undefined (nothing changed) or false (a count is wrong) disable it. */
  private readonly patch = computed(() => {
    const draft = this.editing();
    return draft ? targetPatch(this.target(), draft) : undefined;
  });

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private startEdit(): void {
    this.editing.set(draftOf(this.target()));
    this.refusal.set(null);
    this.slotsRefusal.set(null);
    this.note.set(null);
  }

  private lift(): Promise<void> {
    return this.write(this.greenlighting.sent, 'greenlight the target', async () => {
      await this.greenlightRun.run({ path: { id: this.id() } });
      return 'Greenlit: the quarantine is lifted.';
    });
  }

  private checkLogin(): Promise<void> {
    return this.write(this.checkingLogin.sent, 'check the sign-in', async () => {
      await this.loginCheckRun.run({ path: { id: this.id() } });
      return 'Sign-in check sent: the answer shows here when the runner reports it.';
    });
  }

  private checkHealth(): Promise<void> {
    return this.write(this.checkingHealth.sent, 'run a health check', async () => {
      await this.healthCheckRun.run({ path: { id: this.id() } });
      if (this.healthOpen()) this.healthRead.reload();
      return 'Health check requested: Refresh shows its result once it settles.';
    });
  }

  protected edit(change: Partial<TargetDraft>): void {
    this.editing.update((draft) => (draft ? { ...draft, ...change } : draft));
  }

  protected reserve(type: SlotType, value: string): void {
    this.editing.update((draft) =>
      draft ? { ...draft, reservations: { ...draft.reservations, [type]: value } } : draft,
    );
  }

  protected async save(): Promise<void> {
    const body = this.patch();
    if (!body || this.busy()) return;
    await this.write(this.editingOutcome.sent, 'save the target', async () => {
      await this.patchRun.run({ path: { id: this.id() }, body });
      this.editing.set(null);
      return 'Saved.';
    });
  }

  protected async rotate(): Promise<void> {
    const slots = optionalSlots(this.rotateSlots());
    if (slots === false || this.busy()) return;
    await this.write(this.rotatingOutcome.sent, 'rotate the registration token', async () => {
      const answer = await this.rotateRun.run({
        path: { id: this.id() },
        body: slots === undefined ? {} : { slots },
      });
      this.rotating.set(false);
      this.installLine.set(answer?.installLine ?? null);
      return 'A new registration token: the old install line no longer works.';
    });
  }

  /** The second press: one request, never queued; a busy target opens its leases. */
  private async remove(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.note.set(null);
    try {
      await this.deleteRun.run({ path: { id: this.id() } });
      this.note.set('Deleted.');
      this.deleting.deleted.reach();
      this.changed.emit();
    } catch (error) {
      const refusal = targetRefusalOf(error);
      this.refusal.set(explainTargetRefusal(refusal, 'delete the target'));
      if (refusal.code === 'TARGET_BUSY') this.leasesOpen.set(true);
      this.deleting.refused.reach();
    } finally {
      this.busy.set(false);
      this.confirmingDelete.set(false);
    }
  }

  /** Runs one write: its note on success, its refusal on the card, the targets read again. */
  private async write(
    outcome: { reach(): void },
    doing: string,
    run: () => Promise<string>,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    this.slotsRefusal.set(null);
    this.note.set(null);
    try {
      this.note.set(await run());
      this.changed.emit();
    } catch (error) {
      const refusal = targetRefusalOf(error);
      const said = explainTargetRefusal(refusal, doing);
      // Beside the reserved slots while the draft is open to correct them; else on the card.
      if (isSlotsRefusal(refusal) && this.editing()) this.slotsRefusal.set(said);
      else this.refusal.set(said);
    } finally {
      this.busy.set(false);
      outcome.reach();
    }
  }
}

/** The data marks of what the card derives (each a class constant, as the rule reads). */
const MARKS = {
  connected: { derived: ['connected'] },
  quarantined: { derived: ['quarantined'] },
  hostname: { derived: ['hostname'] },
  connection: { derived: ['connected', 'connectedSince', 'lastSeenAt', 'runnerVersion'] },
  quarantine: { derived: ['quarantineReason', 'quarantinedAt'] },
  inUse: { derived: ['used', 'slotsTotal'] },
  slots: { derived: ['used', 'reservations', 'maximums'] },
  checked: { derived: ['login.checkedAt'] },
  login: { derived: ['login'] },
  command: { derived: ['loginCommand', 'kimiLoginCommand'] },
  health: { derived: ['lastHealthCheckOk'] },
  healthAt: { derived: ['lastHealthCheckAt'] },
  memory: { derived: ['memory'] },
  check: { derived: ['checks'] },
  leaseDetail: { derived: ['detail'] },
  save: { derived: ['description', 'reservations'] },
  deleteLabel: { derived: ['name'] },
} as const;
