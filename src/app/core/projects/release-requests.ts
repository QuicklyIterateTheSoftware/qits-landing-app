import type { ReleaseRequestEntry } from './projects.consumes';

/** How a request or a gate stands, as a chip shows it: on its way, waiting, stuck, or other. */
export type ReleaseTone = 'ok' | 'waiting' | 'failed' | 'neutral';

/** A gate's state as a tone: passed, waiting, failed, or not known. */
export function gateTone(state: string | undefined): ReleaseTone {
  switch (state) {
    case 'PASSED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** A request's state as a tone: on its way or done, waiting, or stuck. */
export function requestTone(state: string | undefined): ReleaseTone {
  switch (state) {
    case 'READY':
    case 'RELEASED':
    case 'FINALIZED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'REJECTED':
    case 'FAILED':
    case 'CONFLICTED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** A request's state chip: "awaiting approval" while a person must still approve it. */
export function requestBadge(request: ReleaseRequestEntry): {
  readonly label: string;
  readonly tone: ReleaseTone;
} {
  const approval = request.approvalState;
  if (
    request.state === 'PENDING' &&
    request.approvalRequired === true &&
    approval !== 'APPROVED' &&
    approval !== 'DECLINED'
  ) {
    return { label: 'awaiting approval', tone: 'waiting' };
  }
  return { label: (request.state ?? 'unknown').toLowerCase(), tone: requestTone(request.state) };
}

/** States in which a request has stopped and waits for a fix. */
const STOPPED: ReadonlySet<string> = new Set(['REJECTED', 'CONFLICTED', 'FAILED']);

/** A machine asked for the request, so nobody waits on it, and it has stopped. */
export function nobodyWatching(request: ReleaseRequestEntry): boolean {
  return request.unattended === true && STOPPED.has(request.state ?? '');
}

/**
 * The newest of a project's release requests: the one changed last (`updatedAt`). qits-projects
 * lists the open requests first and the last finalized ones after them, each part newest first, so
 * the answer's order alone does not say which is newest. On a tie the earlier one in the answer
 * wins. Undefined for no requests.
 */
export function latestReleaseRequest(
  requests: readonly ReleaseRequestEntry[],
): ReleaseRequestEntry | undefined {
  let latest: ReleaseRequestEntry | undefined;
  let latestAt = -Infinity;
  for (const request of requests) {
    const at = request.updatedAt ? Date.parse(request.updatedAt) : NaN;
    const time = Number.isNaN(at) ? -Infinity : at;
    if (latest === undefined || time > latestAt) {
      latest = request;
      latestAt = time;
    }
  }
  return latest;
}

/** An instant as `YYYY-MM-DD HH:MM UTC`, the same for every viewer; empty when missing. */
export function utcMinute(instant: string | undefined): string {
  if (!instant) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** The first seven characters of a commit sha, as git shows it; empty when missing. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '';
}
