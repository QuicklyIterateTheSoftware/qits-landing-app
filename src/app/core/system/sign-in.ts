/**
 * A target sign-in's states (qits-2351, qits-system's `TargetSignIn.state`): STARTING, then
 * AWAITING_BROWSER (kimi: open `url`, approve `userCode`) or AWAITING_CODE (claude: open `url`,
 * paste the code it shows), then one of the terminal states below.
 */
export const TERMINAL: ReadonlySet<string> = new Set([
  'SUCCEEDED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
]);

/** The harnesses a target signs in, in the order the card shows them. */
export const HARNESSES = ['claude', 'kimi'] as const;

/** A harness a target signs in. */
export type Harness = (typeof HARNESSES)[number];

/**
 * How often a sign-in that has not settled is read again (qits-2351): qits-system publishes no
 * sign-in event, and a person is watching a flow that lasts seconds to minutes (`pollWhile`).
 */
export const SIGN_IN_POLL_MS = 2_000;

/** A sign-in in a terminal state: nothing will move it again. */
export function isTerminal(state: string | null | undefined): boolean {
  return !!state && TERMINAL.has(state);
}

/** `Claude`, `Kimi`: a harness as a button names it. */
export function harnessLabel(harness: string): string {
  return harness ? harness[0].toUpperCase() + harness.slice(1) : harness;
}

const SIGN_IN_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * The running sign-in a `SIGN_IN_RUNNING` refusal names: qits-system puts its id in the message,
 * so the page follows that one instead of starting another. Undefined when the message names none.
 */
export function runningSignInId(message: string | undefined): string | undefined {
  return message ? SIGN_IN_ID.exec(message)?.[0] : undefined;
}

/** What a sign-in's state means, in one sentence for the card; `detail` says why when given. */
export function signInSentence(state: string | null | undefined, detail?: string | null): string {
  const why = detail?.trim() ? ` ${detail.trim().replace(/[.!?]?$/, '.')}` : '';
  switch (state) {
    case 'STARTING':
      return 'Starting the sign-in on the target…';
    case 'AWAITING_BROWSER':
      return 'Open the link, sign in and approve the code below.';
    case 'AWAITING_CODE':
      return 'Open the link, sign in, and paste the code the browser shows.';
    case 'SUCCEEDED':
      return 'Signed in.';
    case 'FAILED':
      return `The sign-in failed.${why}`;
    case 'EXPIRED':
      return `The sign-in expired before it finished: start again.${why}`;
    case 'CANCELLED':
      return 'The sign-in was cancelled.';
    default:
      return state ? `The sign-in is ${state}.` : '';
  }
}
