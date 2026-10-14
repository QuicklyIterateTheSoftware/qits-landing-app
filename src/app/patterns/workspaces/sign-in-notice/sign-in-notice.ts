import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AgentSignInStore, signedOutHarness } from '$core/workspaces/agent-sign-in.store';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * "Nobody is signed in", said plainly, with the sign-in terminal offered as the next step (epic
 * qits-1230), ported from qits-workspaces-frontend's sign-in notice. The notice comes from the
 * slot's daemon's harness report (`AgentSignInStore`: a harness with `authenticated: false`,
 * the agent's own when it is known); the button opens the sign-in terminal in the slot's container,
 * which the Terminal tab then shows. While that terminal is open, the notice steps aside. Why the
 * terminal did not open is said in the daemon's words.
 */
@Component({
  selector: 'app-sign-in-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'block' },
  template: `
    @if (signedOut(); as out) {
      @if (!signIn()?.commandId) {
        <div
          class="flex flex-col items-start gap-2 rounded-md border border-sunflower-gold-300 bg-sunflower-gold-50 px-3 py-2.5 text-sm"
          role="alert"
        >
          <p class="m-0 text-sunflower-gold-900">{{ out.message }}</p>
          <p class="m-0 text-sunflower-gold-800">
            The sign-in writes to the shared agent home, so completing it once signs every workspace
            on this platform in. The service starts the agent again on its own afterwards.
          </p>
          <ui-action-button [action]="open()" />
        </div>
      }
    }
    @if (signIn()?.problem; as problem) {
      <p class="m-0 mt-1 text-sm text-cinnabar-700" role="alert">{{ problem }}</p>
    }
  `,
})
export class SignInNotice {
  private readonly store = inject(AgentSignInStore);

  /** The slot whose container the terminal opens in. */
  readonly workspaceRowId = input.required<number>();
  /** The agent's harness, so the notice names the one that matters; any when unknown. */
  readonly harness = input<string | null | undefined>(null);

  protected readonly signIn = computed(() => this.store.signInOf(this.workspaceRowId()));

  protected readonly signedOut = computed(() =>
    signedOutHarness(this.signIn()?.capabilities ?? [], this.harness()),
  );

  protected readonly open = computed((): Action => ({
    label: this.signIn()?.opening ? 'Opening…' : 'Open the sign-in terminal',
    variant: 'success',
    disabled: !!this.signIn()?.opening,
    callback: () =>
      void this.store.open(this.workspaceRowId(), this.signedOut()?.harness ?? undefined),
  }));
}
