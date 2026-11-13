import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { QitsEntityList, QitsField, type QitsResourceRef } from '@qits/angular';
import type { HarnessReport } from '$core/workspaces/agent-sign-in.consumes';
import { signedOutHarness, type SignedOut } from '$core/workspaces/harness-sign-in';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** The read of the slot daemon's harness report (`HARNESS_REPORT`), from the harness setup. */
export type HarnessReportRead = QitsResourceRef<HarnessReport>;

/** The report before it is read, or when it failed: no harness, so no notice. */
const NO_REPORT: HarnessReport = { capabilities: [] };

/**
 * "Nobody is signed in", said plainly, with the sign-in terminal offered as the next step (epic
 * qits-1230), ported from qits-workspaces-frontend's sign-in notice. The notice comes from the
 * slot's daemon's harness report (`report`, the harness setup's `HARNESS_REPORT` read: a harness
 * with `authenticated: false`, the agent's own when it is known); the button asks the harness setup
 * to open the sign-in terminal in the slot's container (`open`), which it then shows. While that
 * terminal is open (`commandId`), the notice steps aside. Why the terminal did not open
 * (`problem`) is said in the daemon's words.
 *
 * It marks what it shows (qits-2141): the notice names the report as its source, derived from its
 * `capabilities`.
 */
@Component({
  selector: 'app-sign-in-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, QitsEntityList, QitsField],
  host: { class: 'block' },
  template: `
    @if (signedOut(); as out) {
      @if (!commandId()) {
        <div
          class="flex flex-col items-start gap-2 rounded-md border border-warning-line bg-warning-soft px-3 py-2.5 text-sm"
          role="alert"
          [qitsEntityList]="report()"
          [fieldOf]="answer()"
          [qitsField]="{ derived: ['capabilities'] }"
        >
          <p class="m-0 text-warning-strong">{{ out.message }}</p>
          <p class="m-0 text-warning-strong">
            The sign-in writes to the shared agent home, so completing it once signs every workspace
            on this platform in. The service starts the agent again on its own afterwards.
          </p>
          <ui-action-button [action]="openAction()" />
        </div>
      }
    }
    @if (problem(); as problem) {
      <p class="m-0 mt-1 text-sm text-danger" role="alert">{{ problem }}</p>
    }
  `,
})
export class SignInNotice {
  /** The slot daemon's harness report. */
  readonly report = input.required<HarnessReportRead>();
  /** The agent's harness, so the notice names the one that matters; any when unknown. */
  readonly harness = input<string | null | undefined>(null);
  /** The sign-in terminal somebody opened, while it is open. */
  readonly commandId = input<string | null>(null);
  /** Whether the terminal is being opened. */
  readonly opening = input(false);
  /** Why the terminal did not open. */
  readonly problem = input<string | null>(null);

  /** Open the sign-in terminal, for the harness nobody signed in. */
  readonly open = output<SignedOut['harness'] | undefined>();

  /** The report; none until it answered (a failed one shows no notice). */
  protected readonly answer = computed(
    () => (this.report().hasValue() ? this.report().value() : undefined) ?? NO_REPORT,
  );

  protected readonly signedOut = computed(() =>
    signedOutHarness(this.answer().capabilities ?? [], this.harness()),
  );

  protected readonly openAction = computed((): Action => ({
    label: this.opening() ? 'Opening…' : 'Open the sign-in terminal',
    variant: 'success',
    disabled: this.opening(),
    callback: () => this.open.emit(this.signedOut()?.harness ?? undefined),
  }));
}
