import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { outcomes, QitsApiError, qitsMutation, stay } from '@qits/angular';
import { pollWhile } from '$core/events/poll-while';
import {
  harnessLabel,
  isTerminal,
  runningSignInId,
  SIGN_IN_POLL_MS,
  signInSentence,
} from '$core/system/sign-in';
import type { TargetSignInState } from '$core/system/targets.consumes';
import {
  TARGET_SIGN_IN_CANCEL,
  TARGET_SIGN_IN_CODE,
  TARGET_SIGN_IN_READ,
  TARGET_SIGN_IN_START,
} from '$core/system/targets.operations';
import { explainTargetRefusal, targetRefusalOf } from '$core/system/target-refusals';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/**
 * One harness's sign-in on a target (qits-2351, qits-system's sign-in doors, qits-1593): the
 * target's runner runs the harness's own login and relays it here, so nobody needs a shell on the
 * node.
 *
 * - **Sign in to <harness>** (`start-target-sign-in`, offered while the target is connected and no
 *   sign-in runs; "again" while the harness is PRESENT) starts one, STARTING. A `SIGN_IN_RUNNING`
 *   refusal names the running sign-in in its message (`runningSignInId`), so this follows that one
 *   instead (another tab, the CLI).
 * - While it waits for a person, its link opens the harness's sign-in page: AWAITING_BROWSER (kimi)
 *   shows the device code to approve there; AWAITING_CODE (claude) takes the code the browser shows
 *   (**Submit**, `submit-target-sign-in-code`), once per state: after a code is sent the field waits
 *   until the sign-in moves.
 * - **Cancel** (`cancel-target-sign-in`) ends it, until it has settled. A terminal state is one
 *   sentence (`signInSentence`); SUCCEEDED tells the card (`signedIn`), which reads the targets
 *   again once: the harness's sign-in itself then arrives as `TargetLoginChanged`.
 *
 * Staleness (qits-1270): qits-system publishes no sign-in event, so a sign-in that has not settled
 * is read again every 2 s (`pollWhile`, `SIGN_IN_POLL_MS`, `follow-target-sign-in`) while this card
 * is on screen and the document visible; it stops on a terminal state, on a 404 (the sign-in is
 * gone: "start again") and when the card goes. A person is watching a flow that lasts seconds to
 * minutes, and no event can tell them it moved. A read sent before a write answered is dropped,
 * so a slow read never takes a newer answer's place.
 */
@Component({
  selector: 'app-target-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flex flex-col gap-2' },
  template: `
    @let signIn = flow();
    @if (startable()) {
      <div class="flex flex-wrap gap-2">
        <ui-action-button [action]="start()" />
      </div>
    }
    @if (signIn) {
      <div
        class="flex flex-col gap-2 rounded-md border border-line bg-surface-muted px-3 py-2 text-sm"
        [attr.aria-label]="label() + ' sign-in'"
        role="group"
        data-sign-in
      >
        <p class="m-0 text-fg" role="status">{{ sentence() }}</p>
        @if (signIn.url && !settled()) {
          <a
            class="break-all text-accent"
            [href]="signIn.url"
            target="_blank"
            rel="noopener noreferrer"
            >Open the {{ label() }} sign-in page</a
          >
        }
        @if (signIn.state === 'AWAITING_BROWSER' && signIn.userCode) {
          <p class="m-0 text-fg">
            Approve the code
            <code class="rounded bg-surface-subtle px-1.5 py-0.5 font-mono">{{
              signIn.userCode
            }}</code>
            there.
          </p>
        }
        @if (signIn.state === 'AWAITING_CODE') {
          <form
            class="flex flex-wrap items-end gap-2"
            (submit)="$event.preventDefault(); submitCode()"
          >
            <label class="flex flex-col gap-1 text-xs text-fg-soft">
              Code from the browser
              <input
                class="h-8 w-72 max-w-full rounded-md border border-line-strong bg-surface px-2 font-mono text-sm text-fg"
                type="text"
                name="code"
                autocomplete="off"
                [value]="code()"
                [disabled]="codeSent()"
                (input)="code.set(text($event))"
              />
            </label>
            <ui-action-button [action]="submit()" />
          </form>
          @if (codeSent()) {
            <p class="m-0 text-xs text-fg-soft">Code sent: waiting for the target to take it.</p>
          }
        }
        @if (!settled()) {
          <div class="flex flex-wrap gap-2">
            <ui-action-button [action]="cancel()" />
          </div>
        }
      </div>
    }
    @if (refusal(); as refusal) {
      <p class="m-0 text-sm text-danger" role="alert">{{ refusal }}</p>
    }
  `,
})
export class TargetSignIn {
  /** The target's id. */
  readonly targetId = input.required<string>();
  /** The harness this signs in: `claude` or `kimi`. */
  readonly harness = input.required<string>();
  /** The target's runner is connected: only then can a sign-in start. */
  readonly connected = input(false);
  /** The harness's sign-in on the target: PRESENT, ABSENT or UNKNOWN. */
  readonly login = input('UNKNOWN');

  /** A sign-in succeeded: the card reads the targets again. */
  readonly signedIn = output<void>();

  protected readonly starting = outcomes('start-target-sign-in', { sent: stay() });
  protected readonly submitting = outcomes('submit-target-sign-in-code', { sent: stay() });
  protected readonly cancelling = outcomes('cancel-target-sign-in', { sent: stay() });

  private readonly startRun = qitsMutation(TARGET_SIGN_IN_START, { offline: 'online-only' });
  private readonly codeRun = qitsMutation(TARGET_SIGN_IN_CODE, { offline: 'online-only' });
  private readonly cancelRun = qitsMutation(TARGET_SIGN_IN_CANCEL, { offline: 'online-only' });

  /** The sign-in followed here; null before one started (or after it was lost). */
  protected readonly flow = signal<TargetSignInState | null>(null);
  /** The code typed so far. */
  protected readonly code = signal('');
  /** The state the last code was sent in: the field waits until the sign-in leaves it. */
  private readonly codeSentIn = signal<string | null>(null);
  /** A write is on its way. */
  protected readonly busy = signal<'start' | 'code' | 'cancel' | null>(null);
  /** Why the last write or read failed, in the page's words. */
  protected readonly refusal = signal<string | null>(null);
  /** Bumped by every write's answer: a read sent before it is dropped. */
  private generation = 0;

  protected readonly label = computed(() => harnessLabel(this.harness()));
  protected readonly settled = computed(() => isTerminal(this.flow()?.state));
  protected readonly codeSent = computed(
    () => !!this.flow()?.state && this.codeSentIn() === this.flow()?.state,
  );
  protected readonly sentence = computed(() =>
    signInSentence(this.flow()?.state, this.flow()?.detail),
  );

  /** Sign in is offered while the target is connected and no sign-in of this harness runs. */
  protected readonly startable = computed(
    () => this.connected() && (this.flow() === null || this.settled()),
  );

  protected readonly start = computed((): Action => ({
    label:
      this.busy() === 'start'
        ? 'Starting…'
        : `Sign in to ${this.label()}${this.login() === 'PRESENT' ? ' again' : ''}`,
    variant: 'muted',
    disabled: this.busy() !== null,
    outcomes: [this.starting.sent],
    callback: () => void this.begin(),
  }));

  protected readonly submit = computed((): Action => ({
    label: this.busy() === 'code' ? 'Submitting…' : 'Submit',
    variant: 'success',
    disabled: this.busy() !== null || this.codeSent() || !this.code().trim(),
    outcomes: [this.submitting.sent],
    callback: () => void this.submitCode(),
  }));

  protected readonly cancel = computed((): Action => ({
    label: this.busy() === 'cancel' ? 'Cancelling…' : 'Cancel sign-in',
    variant: 'muted',
    disabled: this.busy() !== null,
    outcomes: [this.cancelling.sent],
    callback: () => void this.end(),
  }));

  constructor() {
    pollWhile({
      active: () => {
        const flow = this.flow();
        return !!flow?.signInId && !isTerminal(flow.state);
      },
      everyMs: SIGN_IN_POLL_MS,
      refresh: () => void this.follow(),
    });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private async begin(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('start');
    this.refusal.set(null);
    this.codeSentIn.set(null);
    try {
      const signIn = await this.startRun.run({
        path: { id: this.targetId() },
        body: { harness: this.harness() },
      });
      this.take(signIn ?? null);
    } catch (error) {
      const refusal = targetRefusalOf(error);
      const running =
        refusal.code === 'SIGN_IN_RUNNING' ? runningSignInId(refusal.message) : undefined;
      if (running) {
        // One already runs for this harness (another tab, the CLI): follow it.
        this.take({ signInId: running, harness: this.harness(), state: 'STARTING' });
        void this.follow();
      } else {
        this.refusal.set(explainTargetRefusal(refusal, 'start the sign-in'));
      }
    } finally {
      this.busy.set(null);
      this.starting.sent.reach();
    }
  }

  protected async submitCode(): Promise<void> {
    const signIn = this.flow();
    const code = this.code().trim();
    if (!signIn?.signInId || this.busy() || this.codeSent() || !code) return;
    this.busy.set('code');
    this.refusal.set(null);
    try {
      const answer = await this.codeRun.run({
        path: { id: this.targetId(), signInId: signIn.signInId },
        body: { code },
      });
      this.codeSentIn.set(answer?.state ?? signIn.state ?? null);
      this.code.set('');
      this.take(answer ?? signIn);
    } catch (error) {
      this.refusal.set(explainTargetRefusal(targetRefusalOf(error), 'hand over the code'));
    } finally {
      this.busy.set(null);
      this.submitting.sent.reach();
    }
  }

  private async end(): Promise<void> {
    const signIn = this.flow();
    if (!signIn?.signInId || this.busy()) return;
    this.busy.set('cancel');
    this.refusal.set(null);
    try {
      const answer = await this.cancelRun.run({
        path: { id: this.targetId(), signInId: signIn.signInId },
      });
      this.take(answer ?? null);
    } catch (error) {
      this.refusal.set(explainTargetRefusal(targetRefusalOf(error), 'cancel the sign-in'));
    } finally {
      this.busy.set(null);
      this.cancelling.sent.reach();
    }
  }

  /** Reads the followed sign-in again; a 404 means it is gone. */
  private async follow(): Promise<void> {
    const signInId = this.flow()?.signInId;
    if (!signInId) return;
    const sent = this.generation;
    const { data, error, response } = await TARGET_SIGN_IN_READ.fetch({
      path: { id: this.targetId(), signInId },
    });
    if (sent !== this.generation || this.flow()?.signInId !== signInId) return;
    if (data) {
      this.apply(data);
    } else if (response?.status === 404 || error !== undefined) {
      const status = response?.status ?? 0;
      if (status === 404) {
        this.flow.set(null);
        this.refusal.set('This sign-in is gone: start again.');
      } else {
        this.refusal.set(
          explainTargetRefusal(
            targetRefusalOf(new QitsApiError(status, error, TARGET_SIGN_IN_READ)),
            'follow the sign-in',
          ),
        );
      }
    }
  }

  /** A write's answer: newer than any read still on its way. */
  private take(signIn: TargetSignInState | null): void {
    this.generation++;
    if (signIn) this.apply(signIn);
    else this.flow.set(null);
  }

  private apply(signIn: TargetSignInState): void {
    const was = this.flow();
    if (was?.state !== signIn.state && this.codeSentIn() !== signIn.state)
      this.codeSentIn.set(null);
    this.flow.set(signIn);
    if (signIn.state === 'SUCCEEDED' && was?.state !== 'SUCCEEDED') this.signedIn.emit();
  }
}
