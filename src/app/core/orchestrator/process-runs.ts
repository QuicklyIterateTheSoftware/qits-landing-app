import { QitsOfflineError } from '@qits/angular';
import { formatDuration } from '$core/ci/ci-run';
import { describeRefusal, NONE } from '$core/release-requests/release-request-model';
import { refusedBy } from '$core/release-requests/release-request-writes';
import type { ChipTone } from '$ui/components/chip/chip';

/**
 * What the Orchestrator section's process page (qits-2359) makes of qits-orchestrator's runs and
 * steps, pure: the chips' tones, how long a run or a step took, a call's address without the
 * peer's host, a body as readable JSON, and what a start that did not answer 202 came to.
 */

/** The roles qits-orchestrator's process doors admit. */
export const ORCHESTRATOR_ROLES =
  'qits:admin, qits:admin-agent, qits:desk-admin, qits:system or qits:agent';

/**
 * A run's or a step's status as a chip's tone: RUNNING waiting, SUCCEEDED ok, FAILED failed;
 * PENDING, SKIPPED and anything else neutral.
 */
export function processStatusTone(status: string | null | undefined): ChipTone {
  switch (status) {
    case 'RUNNING':
      return 'waiting';
    case 'SUCCEEDED':
      return 'ok';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** Milliseconds since the epoch of `iso`; none for a missing or unreadable one. */
function at(iso: string | null | undefined): number | undefined {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * How long a run or a step took, `finishedAt − startedAt` (`0s`, `2m 5s`); {@link NONE} while it
 * runs, for one that never finished (a run the process died in keeps `finishedAt` null for good)
 * and for one that never started.
 */
export function took(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): string {
  const start = at(startedAt);
  const end = at(finishedAt);
  return start === undefined || end === undefined ? NONE : formatDuration(end - start);
}

/**
 * A step's call without the peer's host: `http://dev-qits-artifacts:8080/artifacts/api/gc/plan`
 * is `/artifacts/api/gc/plan` (the target names the peer). A URL that does not parse stays whole.
 */
export function callPath(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/**
 * A body the service stores as JSON text, indented for reading. Text that is not JSON stays as it
 * is: a response cut at 1 MiB ends with the service's own marker ("…truncated by … at 1048576
 * bytes"), which is kept.
 */
export function readableJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * What a start that brought no new run came to, in a sentence:
 *
 * - offline (the mutation refused before sending): nothing was sent, and a run is never queued;
 * - 409: not started, in the service's words (a run of the kind is already active, or an artifacts
 *   cleanup sweep is in flight);
 * - 403: the viewer may not start one;
 * - 404: the process does not exist (any other 4xx alike: refused before anything ran);
 * - a 5xx or no answer at all: the page cannot tell whether a run started, so Refresh shows it.
 */
export function explainStart(error: unknown): string {
  if (error instanceof QitsOfflineError) {
    return 'Not started: this browser is offline, and a run is never queued.';
  }
  const { status, message } = refusedBy(error);
  if (status === 409)
    return `Not started: ${message ?? 'a run of this process is already active'}.`;
  if (status === 403) return 'Starting a run needs an admin role.';
  if (status >= 400 && status < 500) return `Not started: ${describeRefusal(status, message)}.`;
  return (
    `No answer came back (${describeRefusal(status, message)}), so whether a run started is not ` +
    'known. Refresh shows the runs as they are now.'
  );
}
