import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { RunnerRegistration } from '$core/workspaces/runners.consumes';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { CopyText } from '$patterns/workspaces/copy-text/copy-text';

/**
 * The once-only install panel (epic qits-1230), ported from qits-workspaces-frontend's runners
 * page: registering a runner, or rotating its token, answers a single-use registration token inside
 * a one-line install. The page holds it only while this panel is open; Close (`closed`) drops it,
 * and a reload loses it for good, which the panel says, because the remedy (Rotate token) is only
 * obvious to somebody who knows the line is gone.
 */
@Component({
  selector: 'app-install-line-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton, CopyText],
  host: { class: 'block' },
  template: `
    <section
      class="flex flex-col gap-2 rounded-md border border-sunflower-gold-300 bg-sunflower-gold-50 px-4 py-3 text-sm"
      role="alert"
      aria-label="Install line"
    >
      <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">
        Install line — {{ registration().runner?.name }}
      </h2>
      <p class="m-0 text-charcoal-brown-700">
        Paste this into a terminal on the node, which needs docker. Nothing else is needed.
      </p>
      <p class="m-0 font-semibold text-sunflower-gold-900">
        This is the only time it is shown: the token inside it is single-use, and reloading this
        page loses it for good. Rotate token on the runner makes a new one.
      </p>
      <app-copy-text [text]="registration().installLine ?? ''" label="Copy install line" />
      <p class="m-0 font-semibold text-charcoal-brown-700">Registration token</p>
      <app-copy-text [text]="registration().registrationToken ?? ''" label="Copy token" />
      <div><ui-action-button [action]="close" /></div>
    </section>
  `,
})
export class InstallLinePanel {
  readonly registration = input.required<RunnerRegistration>();

  /** Close was pressed: the page drops the registration, token and all. */
  readonly closed = output<void>();

  protected readonly close: Action = {
    label: 'Close',
    variant: 'muted',
    callback: () => this.closed.emit(),
  };
}
