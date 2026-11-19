import type { CiRunDetail, CiRunStep } from './ci-run.consumes';

/**
 * The run page (qits-2321, `projects/<slug>/ci/runs/<runId>`): which steps are open, what a step's
 * output says about itself, and the run's facts in words. Pure functions, so the page only draws
 * what they give.
 */

/** The statuses a run ends in: it is neither polled nor cancellable in them, and runs again. */
const TERMINAL: readonly string[] = ['SUCCESS', 'FAILED', 'CANCELLED', 'CONFIG_ERROR', 'TIMED_OUT'];

/** Whether a run has ended (any status but QUEUED and RUNNING, which qits-ci answers 409 to). */
export function isTerminal(status: string | null | undefined): boolean {
  return TERMINAL.includes(status ?? '');
}

/** The open-step key of the live step in `?step=`; every other step is keyed by its index. */
export const LIVE_STEP = 'live';

/** A step's key in `?step=`. */
export function stepKey(step: Pick<CiRunStep, 'stepIndex'>): string {
  return String(step.stepIndex ?? '');
}

/** A step status that failed the run, and so is open on arrival. */
const FAILING_STEP: readonly string[] = ['FAILED', 'TIMED_OUT'];

/**
 * The step open on arrival, when `?step=` names none: the first FAILED or TIMED_OUT step, else the
 * live step, else the last step; none for a run with no step yet.
 */
export function defaultOpenStep(run: Pick<CiRunDetail, 'steps' | 'live'>): string | undefined {
  const steps = run.steps ?? [];
  const failed = steps.find((step) => FAILING_STEP.includes(step.status ?? ''));
  if (failed) return stepKey(failed);
  if (run.live) return LIVE_STEP;
  const last = steps[steps.length - 1];
  return last ? stepKey(last) : undefined;
}

/**
 * The open steps: the ones `?step=` names (repeatable), else {@link defaultOpenStep}. A named step
 * the run does not have yet is kept, so a shared link to a step still opens it once it is there.
 */
export function openSteps(
  run: Pick<CiRunDetail, 'steps' | 'live'>,
  named: readonly string[],
): ReadonlySet<string> {
  if (named.length) return new Set(named);
  const fallback = defaultOpenStep(run);
  return new Set(fallback === undefined ? [] : [fallback]);
}

/**
 * `?step=` after a row was toggled: the open steps with `key` flipped, the live step last and the
 * rest by index, as the URL says them.
 */
export function toggledSteps(open: ReadonlySet<string>, key: string): readonly string[] {
  const next = new Set(open);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  const rank = (step: string) => (step === LIVE_STEP ? Number.MAX_SAFE_INTEGER : Number(step));
  return [...next].sort((left, right) => rank(left) - rank(right));
}

/**
 * The head qits-ci writes when it kept only the tail of a step's output
 * (`qits.ci.output-max-chars=65536`).
 */
export const TRUNCATION_MARKER = '[... output truncated ...]\n';

/** A step's output to show, and whether it is only the tail of what the step wrote. */
export interface StepOutput {
  readonly text: string;
  readonly truncated: boolean;
}

/** A step's output, its truncation marker taken off (the page says it in words instead). */
export function stepOutput(output: string | null | undefined): StepOutput {
  const text = output ?? '';
  return text.startsWith(TRUNCATION_MARKER)
    ? { text: text.slice(TRUNCATION_MARKER.length), truncated: true }
    : { text, truncated: false };
}

/** Milliseconds since the epoch of `iso`; none for a missing or unreadable one. */
function at(iso: string | null | undefined): number | undefined {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/** A duration: `0s`, `45s`, `2m 5s`, `1h 3m`. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** How long from `from` to `to`; `–` when either is missing or unreadable. */
export function durationBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  const start = at(from);
  const end = at(to);
  return start === undefined || end === undefined ? '–' : formatDuration(end - start);
}

/** A day: past it, an elapsed time reads as when the step started instead (see {@link elapsedSince}). */
const DAY_MS = 86_400_000;

/**
 * How long a step has been running: `2m 5s`; `–` when its start is unreadable. Past a day the count
 * says nothing a person can use (and changes with every look), so it is `undefined`, and the page
 * says when it started instead.
 */
export function elapsedSince(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string | undefined {
  const start = at(iso);
  if (start === undefined) return '–';
  const ms = nowMs - start;
  return ms > DAY_MS ? undefined : formatDuration(ms);
}

/**
 * How long the run took, or has taken: from its start (else when it was queued) to its finish;
 * `undefined` while it has not finished.
 */
export function runDuration(
  run: Pick<CiRunDetail, 'createdAt' | 'startedAt' | 'finishedAt'>,
): string | undefined {
  if (!run.finishedAt) return undefined;
  return durationBetween(run.startedAt ?? run.createdAt, run.finishedAt);
}

/**
 * When a predicted instant is, from how far ahead of now qits-ci says it is
 * (`expectedStartInMillis`, `expectedFinishInMillis`), ported from qits-ci-frontend's `formatEta`:
 * "any moment now" once due, then "in under a minute", "in about 48 min", "in about 2h 30m".
 */
export function formatEta(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return 'any moment now';
  if (millis < 60_000) return 'in under a minute';
  const minutes = Math.round(millis / 60_000);
  if (minutes < 90) return `in about ${minutes} min`;
  const halfHours = Math.round(millis / 1_800_000);
  const hours = Math.floor(halfHours / 2);
  return halfHours % 2 === 1 ? `in about ${hours}h 30m` : `in about ${hours}h`;
}

/** A queued run's place: `next in the queue` at 0, else `#3 in the queue`. */
export function queuePlace(position: number | null | undefined): string | undefined {
  if (position === null || position === undefined) return undefined;
  return position === 0 ? 'next in the queue' : `#${position + 1} in the queue`;
}

/** How the run was triggered: `push` (a push to the git host) or `event` (a domain event). */
export function triggerLabel(triggerType: string | null | undefined): string | undefined {
  if (triggerType === 'POST_RECEIVE') return 'push';
  if (triggerType === 'EVENT') return 'event';
  return triggerType ?? undefined;
}

/** An `EVENT` run's provenance, `triggerEventName · configPath`; none for any other run. */
export function triggerProvenance(
  run: Pick<CiRunDetail, 'triggerType' | 'triggerEventName' | 'configPath'>,
): string | undefined {
  if (run.triggerType !== 'EVENT') return undefined;
  const parts = [run.triggerEventName, run.configPath].filter((part) => !!part);
  return parts.length ? parts.join(' · ') : undefined;
}

/** A release request phase for a person: `RELEASE_REQUEST` is "QA", `RELEASE` is "release". */
export function phaseLabel(phase: string | null | undefined): string | undefined {
  if (phase === 'RELEASE_REQUEST') return 'QA';
  if (phase === 'RELEASE') return 'release';
  return phase ? phase.toLowerCase().replaceAll('_', ' ') : undefined;
}

/**
 * What a cancellation was, in a sentence (ported from qits-ci-frontend's `run-page.ts`): a run
 * superseded, one whose request went away, one held or displaced by a release request read as
 * neutral; any other reason as a plain stop.
 */
export function cancellationNote(reason: string | null | undefined): string {
  switch (reason) {
    case 'DEDUPED':
      return (
        'This run was superseded before it started — a newer run of the same pipeline took its' +
        ' place. It published no verdict, and nothing is missing: read the newer run instead.'
      );
    case 'RELEASE_REQUEST_CANCELLED':
      return (
        'The release request this run served was withdrawn, so nobody is waiting for the answer.' +
        ' It published no verdict, and nothing is gated on it.'
      );
    case 'HELD_BY_PRE_RUN_GATE':
      return 'Held: an upstream release is still building.';
    case 'SUPERSEDED_BY_RELEASE_REQUEST':
      return 'Superseded by a newer release request.';
    default:
      return (
        'This run was stopped. It published no verdict, so nothing is gated on it — re-run it if' +
        ' the answer is still wanted.'
      );
  }
}

/** A step's name, else its image, else its index. */
export function stepTitle(step: Pick<CiRunStep, 'name' | 'image' | 'stepIndex'>): string {
  return step.name || step.image || `step ${step.stepIndex ?? ''}`.trim();
}

/** A step status for a person: `TIMED_OUT` is "timed out". */
export function stepStatusLabel(status: string | null | undefined): string {
  return (status ?? '').toLowerCase().replaceAll('_', ' ');
}
