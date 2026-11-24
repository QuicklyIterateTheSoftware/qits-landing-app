import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { QitsApiError, QitsEntityList, QitsField, qitsResource } from '@qits/angular';
import { plural } from '$core/artifacts/artifact-listings';
import { loadState } from '$core/resources/load-state';
import { TARGET_EVENTS } from '$core/system/target-events';
import type { TargetRow } from '$core/system/targets.consumes';
import { TARGET_INSTALL_SCRIPT, TARGET_ROWS } from '$core/system/targets.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { DeclareTarget } from '$patterns/system/declare-target/declare-target';
import { TargetCard } from '$patterns/system/target-card/target-card';
import type { Action } from '$ui/components/action-button/action';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The roles qits-system's target reads admit. */
const READ_ROLES = 'qits:admin, qits:admin-agent, qits:desk-admin, qits:system or qits:agent';

/**
 * What re-reads the targets: the lightning menu's `TARGET_EVENTS` (a lease, a login check, a
 * connection), and a target deleted or one of its processes OOM-killed.
 */
const TARGET_PAGE_EVENTS = [...TARGET_EVENTS, 'TargetDeleted', 'TargetOomKilled'] as const;

/**
 * The System section's Targets page (qits-2351), at `/system/targets`: qits-system's execution
 * targets, the hosts whose runners run the platform's CI, workspace, desk and agent slots. It replaces
 * qits-system-frontend's `targets`, which followed no event ("reload the page to see the answer"),
 * hid fields the service sends (`maximums`, `hostname`, `memory`) and polled on a scheduler.
 *
 * **Load budget: 1, then reads on a press.** `TARGET_ROWS` (`listTargets`) is the page, one card
 * per target in the server's order (`app-target-card`); a card's health Details, its Leases and the
 * install script are read only when opened. The read is made in the browser only (the server
 * render has no session).
 *
 * - Header: "Targets", Refresh, and "N targets".
 * - Each card: header, connection, quarantine and Greenlight, slots, sign-in per harness, health,
 *   memory, leases, Edit, Rotate registration token, Delete (`target-card.ts`).
 * - Declare a target (`app-declare-target`), shown with or without targets: its one-time install
 *   line once declared.
 * - View install script: the script the install line pipes into `sh`, read on opening
 *   (`TARGET_INSTALL_SCRIPT`).
 *
 * States: loading; `[]` is one sentence, "No targets are declared yet.", and the form; a 403 names
 * the read roles; any other failure says the targets could not be read, with Retry.
 *
 * Marks (qits-2141): the list is the targets' read, each card a target by its `id` (its fields
 * marked in the card); the count is derived from the whole answer.
 *
 * Staleness (qits-1270): the resource's `refreshOn`, `TARGET_EVENTS` (`TargetLeaseChanged`,
 * `TargetLoginChanged`, `TargetConnectionChanged`), `TargetDeleted` and `TargetOomKilled` → the
 * whole list, debounced 1 s; a card's open Leases follow `TargetLeaseChanged` naming it. Creating,
 * patching, greenlighting a target, rotating its token and a health check's result publish no
 * event, so the page reads the list again after each of its own writes, and Refresh covers a
 * change made elsewhere (the CLI, another person). A running sign-in, which no event announces
 * either, is read again every 2 s while its card is open (`app-target-sign-in`, `pollWhile`).
 */
@Component({
  selector: 'app-system-targets-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeclareTarget,
    LoadFailure,
    PageLayoutComponent,
    QitsEntityList,
    QitsField,
    Spinner,
    TargetCard,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Targets" [actions]="actions">
        @if (state() === 'loaded') {
          <p class="mt-0 mb-4 text-sm text-fg-soft" [qitsEntityList]="targets" data-lede>
            <span [fieldOf]="answer()" [qitsField]="marks.count">{{ caption() }}</span>
          </p>
        }

        @if (refused()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading the targets needs one of the roles {{ roles }}.
          </p>
        } @else {
          <ui-load-failure
            message="The targets could not be read."
            [class.hidden]="state() !== 'error'"
            (retry)="targets.reload()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            <div class="flex flex-col gap-8">
              @if (rows().length === 0) {
                <p
                  role="status"
                  class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                >
                  No targets are declared yet.
                </p>
              } @else {
                <ul class="m-0 flex list-none flex-col gap-4 p-0" [qitsEntityList]="targets">
                  @for (row of rows(); track row.id) {
                    <li app-target-card [target]="row" (changed)="targets.reload()"></li>
                  }
                </ul>
              }

              <app-declare-target (declared)="targets.reload()" />

              <section class="flex flex-col gap-2" aria-label="Install script">
                <div>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent"
                    [attr.aria-expanded]="scriptOpen()"
                    (click)="scriptOpen.set(!scriptOpen())"
                  >
                    View install script
                  </button>
                </div>
                @if (scriptOpen()) {
                  <ui-spinner [state]="scriptState()" class="min-h-8">
                    @if (script.status() === 'error') {
                      <p class="m-0 text-sm text-danger" role="alert">
                        The install script could not be read.
                      </p>
                    } @else {
                      <pre
                        class="m-0 max-h-96 overflow-auto rounded-md bg-surface-subtle p-3 font-mono text-xs text-fg"
                        [qitsEntityList]="script"
                        data-install-script
                      ><span [fieldOf]="scriptAnswer()" [qitsField]="marks.script">{{
                          scriptText()
                        }}</span></pre>
                    }
                  </ui-spinner>
                }
              </section>
            </div>
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class SystemTargetsPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The targets; read again after a target event, and after each write of the page's own. */
  protected readonly targets = qitsResource(TARGET_ROWS, () => (this.browser ? {} : undefined), {
    refreshOn: { names: TARGET_PAGE_EVENTS, debounceMs: 1_000 },
  });

  /** The install script is open: it is read. */
  protected readonly scriptOpen = signal(false);

  /** The install script, read on opening. */
  protected readonly script = qitsResource(TARGET_INSTALL_SCRIPT, () =>
    this.browser && this.scriptOpen() ? {} : undefined,
  );

  /** The read's answer; no targets while it has none. */
  protected readonly answer = computed(
    (): readonly TargetRow[] => (this.targets.hasValue() ? this.targets.value() : []) ?? [],
  );

  /** The cards, in the server's order (by name). */
  protected readonly rows = computed((): readonly TargetRow[] => this.answer());

  protected readonly state = computed((): LoadState => loadState(this.targets));
  protected readonly scriptState = computed((): LoadState => loadState(this.script));

  protected readonly scriptText = computed(() => {
    const text: unknown = this.script.hasValue() ? this.script.value() : undefined;
    return typeof text === 'string' ? text : '';
  });

  /** The script's answer, as the field mark takes it: the text is the whole body. */
  protected readonly scriptAnswer = computed(() => ({ script: this.scriptText() }));

  /** A 403: the viewer's roles may not read the targets. */
  protected readonly refused = computed(() => {
    if (this.targets.status() !== 'error') return false;
    const error = this.targets.error();
    return error instanceof QitsApiError && error.status === 403;
  });

  /** `1 target`. */
  protected readonly caption = computed(() => plural(this.rows().length, 'target'));

  /** Refresh: the targets, read again (a change made elsewhere may send no event). */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.targets.reload() },
  ];

  protected readonly marks = MARKS;
  protected readonly roles = READ_ROLES;
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  count: { derived: [] },
  script: { derived: [] },
} as const;
