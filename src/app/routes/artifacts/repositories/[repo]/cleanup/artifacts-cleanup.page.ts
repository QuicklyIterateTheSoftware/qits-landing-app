import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsExit,
  QitsField,
  qitsMutation,
  QitsOfflineError,
  qitsResource,
  QitsTriggers,
  stay,
} from '@qits/angular';
import { formatBytes, plural } from '$core/artifacts/artifact-listings';
import type {
  CleanupIdentity,
  CleanupPin,
  CleanupPlan,
  CleanupReceipt,
} from '$core/artifacts/cleanup.consumes';
import {
  ARTIFACTS_CLEANUP_PLAN,
  ARTIFACTS_CLEANUP_SWEEP,
} from '$core/artifacts/cleanup.operations';
import { describeRefusal, formatInstant } from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import { loadState } from '$core/resources/load-state';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { CleanupReceiptComponent } from '$patterns/artifacts/cleanup-receipt/cleanup-receipt';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** The roles qits-orchestrator's cleanup doors admit. */
const CLEANUP_ROLES = 'qits:admin, qits:admin-agent, qits:desk-admin, qits:system or qits:agent';

/**
 * One store repository's cleanup (qits-2329), at `/artifacts/repositories/<repo>/cleanup`: what
 * garbage collection would delete in this repository and what it keeps, each identity with the
 * named rule that decided it, the configured rule, how the run read the live pins, and, below all
 * of it, the Run. It replaces qits-artifacts-frontend's `repositories/:repo/cleanup`.
 *
 * **Load budget: 1 + 0.** One read, `ARTIFACTS_CLEANUP_PLAN` (qits-orchestrator's
 * `planArtifactsCleanupRepository`: it reads the live pins and asks qits-artifacts, whose plan it
 * answers verbatim), which carries the whole report. Running costs one more request and reads
 * nothing again: the sweep answers with its receipt. The read is made in the browser only (the
 * server render has no session).
 *
 * **This page is the review gate, and the gate is its layout.** Nothing sweeps without the dry run
 * being read, so the Run lives only here, below the rendered plan. What that guarantees is exact:
 * the plan was served and shown before the press existed. It cannot prove anybody read it.
 *
 * **The plan on screen authorises; a fresh plan executes.** The service computes a new plan inside
 * the sweep and applies that one, because a stored plan is a plan on stale facts. So `generatedAt`
 * is printed: the plan is a photograph, and the reader sees how old.
 *
 * **Run is drawn only when it can sweep something** — `executable` (the live pins answered),
 * `error === null` (the type planned) and a non-empty dead list — and is absent otherwise, never
 * disabled: a disabled button promises a later press works on what is on screen. The plan itself
 * stays visible when the pins could not be read, because a review needs no pins. The first press
 * asks (`2 identities · 41.2 MiB?`), the second sends `ARTIFACTS_CLEANUP_SWEEP` through
 * `qitsMutation`, `online-only`: a write that deletes is never queued offline, and nothing sends it
 * again by itself.
 *
 * **The kept list makes the dead list reviewable**, so it is on the page, collapsed (it is usually
 * the longer one), each entry with the rule that saved it.
 *
 * **After a run, the receipt replaces the plan in place**: a plan beside a receipt is two answers
 * to one question, one of them now false. Re-read the plan drops the receipt and reads again.
 *
 * **A failed run says what is known about the store afterwards** (`explainRun`): a 4xx is a refusal
 * before anything ran, so nothing was deleted (the service's own words where it sent some; 409: a
 * gc run is active; 403: not allowed, not an error); a 5xx or no answer at all means no receipt came
 * back, and the page cannot tell, so it says to re-read the plan.
 *
 * Dropped from the old page on purpose: the row-less blob pool (`untouchable`), a store-wide figure
 * rather than this repository's; and the tunnel hint for an unreachable qits-orchestrator (this
 * app's own door is private, qits-2360, so a reader of the page is on the network qits-orchestrator
 * answers on: no answer is "unreachable", like any other service's).
 *
 * States: loading; a failed read offers Retry; a 404 is "There is no repository called <repo> in
 * this store"; a 403 names the roles that may read it; a type without a collector (`strategy`
 * `null`) says it is not collected and shows no figures.
 *
 * Marks (qits-2141): the plan is the plan read's entity by `repository`, each identity an entity by
 * its `identity`, each pin source by its `source`; the receipt is the sweep's entity by
 * `repository`.
 *
 * Staleness (qits-1270): none can follow, and nothing polls: qits-artifacts emits no domain event
 * for a push or a sweep. Re-read the plan reads it again.
 */
@Component({
  selector: 'app-artifacts-cleanup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    CleanupReceiptComponent,
    LoadFailure,
    PageLayoutComponent,
    QitsEntity,
    QitsExit,
    QitsField,
    QitsTriggers,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="'Cleanup — ' + repo()" [actions]="actions()">
        <p class="mt-0 mb-2 text-sm">
          <a
            class="font-semibold text-accent no-underline hover:underline"
            [qitsExit]="leaving.back"
            [exitParams]="{ repo: repo() }"
            [exitCurrent]="null"
            data-back
            >← {{ repo() }}</a
          >
        </p>

        @if (unknownRepository()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            There is no repository called “{{ repo() }}” in this store.
          </p>
        } @else if (refused()) {
          <p
            role="alert"
            class="m-0 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
          >
            Reading a cleanup plan needs one of qits-orchestrator’s gc roles: {{ roles }}.
          </p>
        } @else {
          <ui-load-failure
            message="The cleanup plan could not be read. Nothing was deleted."
            [class.hidden]="state() !== 'error'"
            (retry)="reread()"
          />
          <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
            @if (shown(); as plan) {
              <div [qitsEntity]="plan" entityKey="repository" [entitySource]="planRead" data-plan>
                <p class="mt-0 mb-3 flex flex-wrap items-center gap-2 text-sm text-fg-soft">
                  <ui-chip [label]="plan.type ?? ''" [fieldOf]="plan" qitsField="type" />
                  <span [fieldOf]="plan" [qitsField]="marks.generatedAt" data-generated-at
                    >Plan as of {{ instant(plan.generatedAt) }} — a photograph, not a promise: a
                    push since then makes it stale, which is why a run computes its own plan again
                    and applies that one.</span
                  >
                </p>
                @if (plan.configuration?.rule) {
                  <p
                    class="mt-0 mb-3 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-fg"
                    [fieldOf]="plan"
                    qitsField="configuration.rule"
                    data-rule
                  >
                    {{ plan.configuration?.rule }}
                  </p>
                }
                @if (plan.note && !notCollected()) {
                  <p class="mt-0 mb-3 text-sm text-fg-soft" [fieldOf]="plan" qitsField="note">
                    {{ plan.note }}
                  </p>
                }

                @if (plan.executable === false) {
                  <p
                    role="alert"
                    class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
                    [fieldOf]="plan"
                    [qitsField]="marks.pinFailures"
                    data-not-executable
                  >
                    This cleanup cannot be run now: the live pins could not be read ({{
                      pinFailures(plan)
                    }}). A run reads them once at its start and aborts whole when a source cannot
                    answer, because a keep-set without a live pin is a keep-set built on “nothing is
                    pinned”. The plan below is still worth reading; there is nothing to press.
                  </p>
                }

                @if (plan.error) {
                  <p
                    role="alert"
                    class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
                    [fieldOf]="plan"
                    qitsField="error"
                    data-plan-error
                  >
                    Nothing of this repository was planned: {{ plan.error }}. Its type failed
                    closed, so every blob it holds is treated as live and no figure below is a
                    finding.
                  </p>
                } @else if (notCollected()) {
                  <p
                    class="mt-0 mb-3 text-sm text-fg-soft"
                    [fieldOf]="plan"
                    [qitsField]="marks.notCollected"
                    data-not-collected
                  >
                    Not collected: nothing collects this repository’s type, so nothing of it is ever
                    deleted.
                    {{ plan.note ?? '' }}
                  </p>
                }

                @if (receipt(); as receipt) {
                  <section aria-labelledby="cleanup-receipt" class="mt-4" data-receipt>
                    <h2 id="cleanup-receipt" class="mt-0 mb-1 text-base font-semibold">
                      What the run did
                    </h2>
                    <app-cleanup-receipt [receipt]="receipt" [source]="sweeping" />
                    <p class="m-0 text-sm text-fg-soft">
                      The plan this receipt replaced is gone on purpose: it described a store that
                      no longer exists.
                      <button
                        type="button"
                        class="ml-1 inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted"
                        [qitsTriggers]="[rereading.reread]"
                        (click)="reread()"
                      >
                        Re-read the plan
                      </button>
                    </p>
                  </section>
                } @else if (!notCollected()) {
                  <section aria-labelledby="cleanup-dead" class="mt-4 mb-6">
                    <h2 id="cleanup-dead" class="mt-0 mb-1 text-base font-semibold">
                      Would be deleted
                    </h2>
                    @if ((plan.dead ?? []).length === 0) {
                      <p class="m-0 text-sm text-fg-muted" data-nothing-dead>
                        Nothing. Every identity in this repository is kept by a rule, and the rules
                        are listed below.
                      </p>
                    } @else {
                      <p
                        class="mt-0 mb-2 text-sm text-fg"
                        [fieldOf]="plan"
                        [qitsField]="marks.deadFigures"
                        data-dead-figures
                      >
                        {{ deadFigures(plan) }}
                      </p>
                      @if (withheldNote(plan); as held) {
                        <p
                          class="mt-0 mb-2 text-sm text-fg-soft"
                          [fieldOf]="plan"
                          [qitsField]="marks.withheld"
                          data-withheld
                        >
                          {{ held }}
                        </p>
                      }
                      @if (structuralNote(plan); as structural) {
                        <p
                          class="mt-0 mb-2 text-sm text-fg-soft"
                          [fieldOf]="plan"
                          [qitsField]="marks.structural"
                          data-structural
                        >
                          {{ structural }}
                        </p>
                      }
                      <ul class="mt-0 mb-0 pl-5 text-sm" aria-label="Would be deleted">
                        @for (identity of plan.dead; track identity.identity) {
                          <li [qitsEntity]="identity" entityKey="identity">
                            <span class="font-mono" [fieldOf]="identity" qitsField="identity">{{
                              identity.identity
                            }}</span>
                            —
                            <span class="text-fg-soft" [fieldOf]="identity" qitsField="rule">{{
                              identity.rule
                            }}</span>
                          </li>
                        }
                      </ul>
                    }
                  </section>

                  <section aria-labelledby="cleanup-kept" class="mb-6">
                    <h2 id="cleanup-kept" class="mt-0 mb-1 text-base font-semibold">
                      Would be kept
                    </h2>
                    @if ((plan.kept ?? []).length === 0) {
                      <p class="m-0 text-sm text-fg-muted">
                        Nothing: this repository holds no identities of its type at all.
                      </p>
                    } @else {
                      <button
                        type="button"
                        class="inline-flex h-7 items-center rounded-md border border-line bg-surface px-2 text-xs font-semibold text-fg-soft hover:bg-surface-muted aria-expanded:border-accent-line aria-expanded:bg-accent-soft aria-expanded:text-accent"
                        [attr.aria-expanded]="showKept()"
                        [qitsTriggers]="[keeping.toggled]"
                        [fieldOf]="plan"
                        [qitsField]="marks.keptCount"
                        (click)="toggleKept()"
                      >
                        {{ keptLabel(plan) }}
                      </button>
                      @if (showKept()) {
                        <ul class="mt-2 mb-0 pl-5 text-sm" aria-label="Would be kept">
                          @for (identity of plan.kept; track identity.identity) {
                            <li [qitsEntity]="identity" entityKey="identity">
                              <span class="font-mono" [fieldOf]="identity" qitsField="identity">{{
                                identity.identity
                              }}</span>
                              —
                              <span class="text-fg-soft" [fieldOf]="identity" qitsField="rule">{{
                                identity.rule
                              }}</span>
                            </li>
                          }
                        </ul>
                      }
                    }
                  </section>
                }

                @if (!receipt()) {
                  <section aria-labelledby="cleanup-pins" class="mb-6">
                    <h2 id="cleanup-pins" class="mt-0 mb-1 text-base font-semibold">
                      How this plan read the live pins
                    </h2>
                    <p class="mt-0 mb-2 text-xs text-fg-muted">
                      What is kept is partly another service’s answer, read once at the start of
                      this plan and never cached: check these are the versions your deployments run.
                    </p>
                    <ul class="m-0 pl-5 text-sm" aria-label="Pin sources">
                      @for (pin of plan.pins; track pin.source) {
                        <li class="mb-1" [qitsEntity]="pin" entityKey="source">
                          <span
                            class="font-mono text-xs"
                            [fieldOf]="pin"
                            [qitsField]="marks.pinLine"
                            >{{ pinLine(pin) }}</span
                          >
                          <br />
                          <span class="text-xs text-fg-soft" [fieldOf]="pin" qitsField="outcome">{{
                            pin.outcome
                          }}</span>
                        </li>
                      }
                    </ul>
                  </section>

                  @if (runError(); as problem) {
                    <p
                      role="alert"
                      class="mt-0 mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-fg"
                      data-run-error
                    >
                      {{ problem }}
                    </p>
                  }

                  @if (runnable(plan)) {
                    @if (!confirming()) {
                      <p class="m-0" data-run>
                        <ui-action-button
                          [action]="askRun()"
                          [fieldOf]="plan"
                          [qitsField]="marks.runLabel"
                        />
                      </p>
                    } @else {
                      <div
                        class="rounded-md border border-danger-line bg-danger-soft px-3 py-3 text-sm text-fg"
                        data-confirm
                      >
                        <p
                          class="mt-0 mb-3"
                          role="alert"
                          [fieldOf]="plan"
                          [qitsField]="marks.deadFigures"
                        >
                          Run this cleanup on <strong>{{ repo() }}</strong
                          >? It deletes {{ identities(plan.dead?.length) }} listed above and unlinks
                          {{ plural(plan.sweep?.blobCount, 'blob file') }}, reclaiming
                          {{ bytes(plan.sweep?.reclaimableBytes) }}. This is not reversible: the
                          bytes are gone, and an npm version’s name is spent for good. Nothing
                          outside this repository is touched.
                        </p>
                        <div class="flex flex-wrap gap-2">
                          <ui-action-button
                            [action]="run()"
                            [fieldOf]="plan"
                            [qitsField]="marks.runLabel"
                          />
                          <ui-action-button [action]="keep()" />
                        </div>
                      </div>
                    }
                  } @else if (
                    plan.executable && !plan.error && !notCollected() && !(plan.dead ?? []).length
                  ) {
                    <p class="m-0 text-sm text-fg-muted" data-nothing-to-run>
                      There is nothing to run: this plan condemns nothing, so a cleanup now would
                      delete nothing and free nothing.
                    </p>
                  }
                }
              </div>
            }
          </ui-spinner>
        }
      </app-page-layout>
    </div>
  `,
})
export class ArtifactsCleanupPage {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  /** "← <repo>": the repository's store page. */
  protected readonly leaving = outcomes('leave-artifacts-cleanup', {
    back: exit('artifacts/repositories/:repo'),
  });

  /** Re-read the plan: the page stays, the receipt goes, the plan is read again. */
  protected readonly rereading = outcomes('reread-artifacts-cleanup-plan', { reread: stay() });

  /** The first press of Run asks; Keep everything takes the question back. No request. */
  protected readonly asking = outcomes('ask-artifacts-cleanup-run', {
    asked: stay(),
    kept: stay(),
  });

  /** The second press: the receipt in the plan's place, or the refusal said. */
  protected readonly sweepingOutcome = outcomes('sweep-artifacts-repository', {
    swept: stay(),
    refused: stay(),
  });

  /** The kept list, shown or hidden. */
  protected readonly keeping = outcomes('toggle-artifacts-cleanup-kept', { toggled: stay() });

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL's store repository name. */
  protected readonly repo = computed(() => this.params().get('repo') ?? '');

  /** The repository's plan. */
  protected readonly planRead = qitsResource(ARTIFACTS_CLEANUP_PLAN, () => {
    const repository = this.repo();
    return this.browser && repository ? { path: { repository } } : undefined;
  });

  /**
   * The sweep. `online-only`: a write that deletes is sent now or not at all, never kept in an
   * outbox to be sent later, and nothing here sends it again by itself.
   */
  protected readonly sweeping = qitsMutation(ARTIFACTS_CLEANUP_SWEEP, { offline: 'online-only' });

  /** The receipt of a run made on this page; null while the plan is what is shown. */
  protected readonly receipt = linkedSignal<string, CleanupReceipt | null>({
    source: this.repo,
    computation: () => null,
  });

  /** Run is waiting for its second press. */
  protected readonly confirming = linkedSignal({ source: this.repo, computation: () => false });

  /** The sweep is on its way. */
  protected readonly busy = signal(false);

  /** What the last run failed with, in this page's words. */
  protected readonly runError = linkedSignal<string, string | null>({
    source: this.repo,
    computation: () => null,
  });

  /** The kept list is open; closed again when another repository opens. */
  protected readonly showKept = linkedSignal({ source: this.repo, computation: () => false });

  /** The plan, once read. */
  protected readonly shown = computed((): CleanupPlan | undefined =>
    this.planRead.hasValue() ? this.planRead.value() : undefined,
  );

  private readonly failure = computed((): number | undefined => {
    if (this.planRead.status() !== 'error') return undefined;
    const error = this.planRead.error();
    return error instanceof QitsApiError ? error.status : undefined;
  });

  /** A 404: the store holds no repository of that name. */
  protected readonly unknownRepository = computed(() => this.failure() === 404);

  /** A 403: the viewer holds none of the cleanup roles. */
  protected readonly refused = computed(() => this.failure() === 403);

  protected readonly state = computed((): LoadState => loadState(this.planRead));

  /** The type has no collector (`strategy` null) and refused nothing: there are no figures. */
  protected readonly notCollected = computed(() => {
    const plan = this.shown();
    return !!plan && plan.strategy === null && !plan.error;
  });

  /** Re-read the plan, in the header. */
  protected readonly actions = computed((): readonly Action[] => [
    {
      label: 'Re-read the plan',
      variant: 'muted',
      disabled: this.busy(),
      outcomes: [this.rereading.reread],
      callback: () => this.reread(),
    },
  ]);

  /** The first press: `Run: 1 identity · 0 B…`. */
  protected readonly askRun = computed((): Action => ({
    label: `Run: ${this.runLabel()}…`,
    variant: 'danger',
    outcomes: [this.asking.asked],
    callback: () => {
      this.confirming.set(true);
      this.runError.set(null);
      this.asking.asked.reach();
    },
  }));

  /** The second press. */
  protected readonly run = computed((): Action => ({
    label: `Delete ${this.runLabel()}`,
    variant: 'danger',
    disabled: this.busy(),
    outcomes: [this.sweepingOutcome.swept, this.sweepingOutcome.refused],
    callback: () => void this.sweep(),
  }));

  /** Takes the question back. */
  protected readonly keep = computed((): Action => ({
    label: 'Keep everything',
    variant: 'muted',
    disabled: this.busy(),
    outcomes: [this.asking.kept],
    callback: () => {
      this.confirming.set(false);
      this.asking.kept.reach();
    },
  }));

  protected readonly marks = MARKS;
  protected readonly roles = CLEANUP_ROLES;
  protected readonly plural = plural;

  /** `1 identity · 41.2 MiB`: what a run now would take. */
  private readonly runLabel = computed(() => {
    const plan = this.shown();
    return plan
      ? `${this.identities(plan.dead?.length)} · ${formatBytes(plan.sweep?.reclaimableBytes ?? 0)}`
      : '';
  });

  /** Run is drawn: the live pins answered, the type planned, and there is something to delete. */
  protected runnable(plan: CleanupPlan): boolean {
    return plan.executable === true && !plan.error && (plan.dead ?? []).length > 0;
  }

  /** Re-read the plan, dropping any receipt: what is on screen is one answer, not two. */
  protected reread(): void {
    this.receipt.set(null);
    this.confirming.set(false);
    this.runError.set(null);
    this.planRead.reload();
    this.rereading.reread.reach();
  }

  protected toggleKept(): void {
    this.showKept.update((open) => !open);
    this.keeping.toggled.reach();
  }

  /** The second press: one request, whose receipt the page then shows in the plan's place. */
  private async sweep(): Promise<void> {
    const repository = this.repo();
    if (this.busy() || !repository) return;
    this.busy.set(true);
    this.runError.set(null);
    try {
      const receipt = await this.sweeping.run({ path: { repository } });
      if (receipt) {
        this.receipt.set(receipt);
        this.confirming.set(false);
        this.sweepingOutcome.swept.reach();
      } else {
        this.confirming.set(false);
        this.runError.set(explainRun(undefined));
        this.sweepingOutcome.refused.reach();
      }
    } catch (error) {
      // Asked again from the start: a failed run is never sent again by itself.
      this.confirming.set(false);
      this.runError.set(explainRun(error));
      this.sweepingOutcome.refused.reach();
    } finally {
      this.busy.set(false);
    }
  }

  /** `2 identities`, `1 identity`. */
  protected identities(count: number | undefined): string {
    return count === 1 ? '1 identity' : `${count ?? 0} identities`;
  }

  protected bytes(value: number | undefined): string {
    return formatBytes(value ?? 0);
  }

  protected instant(iso: string | undefined): string {
    return formatInstant(iso);
  }

  /** The failures of the live pin reads, joined; `no source answered` when none were named. */
  protected pinFailures(plan: CleanupPlan): string {
    const failures = plan.pinFailures ?? [];
    return failures.length ? failures.join('; ') : 'no reason was given';
  }

  /** `qits-cd · 2 pins · 41 ms`, or `qits-cd · did not answer · 41 ms`. */
  protected pinLine(pin: CleanupPin): string {
    const answered = pin.answered ? plural(pin.pinCount, 'pin') : 'did not answer';
    return `${pin.source ?? ''} · ${answered} · ${pin.tookMillis ?? 0} ms`;
  }

  /** `1 identity, freeing 0 B in 0 blob files — bytes nothing else in this store names.` */
  protected deadFigures(plan: CleanupPlan): string {
    return (
      `${this.identities(plan.dead?.length)}, freeing ${this.bytes(plan.sweep?.reclaimableBytes)} ` +
      `in ${plural(plan.sweep?.blobCount, 'blob file')} — bytes nothing else in this store names. ` +
      'Not additive with any other repository’s figure.'
    );
  }

  /** What the grace window holds back, or null when it holds nothing. */
  protected withheldNote(plan: CleanupPlan): string | null {
    const held = plan.sweep?.withheldByGraceWindow ?? 0;
    if (held === 0) return null;
    return (
      `${plural(held, 'blob')} (${this.bytes(plan.sweep?.withheldBytes)}) are younger than the ` +
      `${plan.graceWindow ?? ''} grace window and this run leaves them alone. Not lost: a later run ` +
      'takes them, with the rows that name them.'
    );
  }

  /** What the rule condemns whatever the files' age, when that differs from what a run takes. */
  protected structuralNote(plan: CleanupPlan): string | null {
    const structural = plan.structural?.blobCount ?? 0;
    if (structural === (plan.sweep?.blobCount ?? 0)) return null;
    return (
      `The rule condemns ${plural(structural, 'blob')} ` +
      `(${this.bytes(plan.structural?.reclaimableBytes)}) in total, whatever the age of the files.`
    );
  }

  /** `Show the 2 kept identities, each with the rule that saved it`. */
  protected keptLabel(plan: CleanupPlan): string {
    const verb = this.showKept() ? 'Hide' : 'Show';
    const count = plan.kept?.length ?? 0;
    return `${verb} the ${count === 1 ? 'kept identity' : `${count} kept identities`}, each with the rule that saved it`;
  }
}

/**
 * A failed run, in a sentence that says what is known about the store afterwards. The words are
 * the service's own wherever it sent some (qits-orchestrator's 409 while a gc run is active, its
 * 502 when qits-artifacts could not be asked, qits-artifacts' 404), with what follows from the
 * status:
 *
 * - offline (the mutation refused before sending): nothing was sent, so nothing was deleted;
 * - 403: the viewer is not allowed to run it, which is no error, and nothing was deleted;
 * - any other 4xx: a refusal before anything ran, so nothing was deleted;
 * - a 5xx, or no answer at all (status 0): no receipt came back, and that is all the page knows (a
 *   502 can be an answer lost after the sweep began), so it says to re-read the plan rather than
 *   claim nothing happened.
 */
export function explainRun(error: unknown): string {
  if (error instanceof QitsOfflineError) {
    return 'The cleanup did not run — this browser is offline, and a cleanup is never queued. Nothing was deleted.';
  }
  const { status, message } = refusedBy(error);
  if (status === 403) {
    return `The cleanup did not run — you are not allowed to run it: only ${CLEANUP_ROLES} may. Nothing was deleted.`;
  }
  if (status === 409) {
    return `The cleanup did not run — ${message ?? 'a gc run is active'}. Nothing was deleted.`;
  }
  if (status >= 400 && status < 500) {
    return `The cleanup did not run — ${describeRefusal(status, message)}. Nothing was deleted.`;
  }
  return (
    `No receipt came back — ${describeRefusal(status, message)}. This page cannot tell whether ` +
    'anything was deleted: re-read the plan before running it again.'
  );
}

/** The data marks of what the page derives (each a class constant, as the rule reads). */
const MARKS = {
  generatedAt: { derived: ['generatedAt'] },
  pinFailures: { derived: ['pinFailures', 'executable'] },
  notCollected: { derived: ['strategy', 'note'] },
  deadFigures: { derived: ['dead', 'sweep.reclaimableBytes', 'sweep.blobCount'] },
  withheld: { derived: ['sweep.withheldByGraceWindow', 'sweep.withheldBytes', 'graceWindow'] },
  structural: { derived: ['structural.blobCount', 'structural.reclaimableBytes'] },
  keptCount: { derived: ['kept'] },
  runLabel: { derived: ['dead', 'sweep.reclaimableBytes'] },
  pinLine: { derived: ['source', 'answered', 'pinCount', 'tookMillis'] },
} as const;
