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

/** True when `id` has the shape of a uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The request that `id` names, by its uuid or its logical id (`qualifiedId`, `<repository>-rr-<n>`).
 * Undefined when no request in `requests` has that id.
 */
export function findReleaseRequest(
  requests: readonly ReleaseRequestEntry[],
  id: string,
): ReleaseRequestEntry | undefined {
  return requests.find((request) => request.id === id || request.qualifiedId === id);
}

/**
 * The name of the request that `id` (a uuid or a logical id) names: its logical id when it has
 * one. Otherwise a uuid is cut to its first eight characters, and any other id shows whole.
 */
export function releaseRequestName(requests: readonly ReleaseRequestEntry[], id: string): string {
  const request = findReleaseRequest(requests, id);
  if (request?.qualifiedId) return request.qualifiedId;
  return UUID.test(id) ? id.slice(0, 8) : id;
}

/** The id that a link to `request` uses: its logical id when it has one, else its uuid. */
export function releaseRequestRef(request: ReleaseRequestEntry): string {
  return request.qualifiedId || request.id || '';
}

/**
 * What the soft feature freeze (epic qits-1580) reads of a request: the freeze in force and the
 * queue around it. The list's entries and a request's own page both carry these fields.
 */
export type FreezeFields = Pick<
  ReleaseRequestEntry,
  | 'state'
  | 'featureFreeze'
  | 'queuedBehind'
  | 'queuedBehindQualifiedId'
  | 'queuedNext'
  | 'queuedNextQualifiedId'
>;

/** States after which the freeze no longer holds anything back: released and done, or gone. */
const PAST_FREEZE: ReadonlySet<string> = new Set([
  'RELEASED',
  'FINALIZED',
  'WITHDRAWN',
  'OBSOLETE',
]);

/** The request still gathers branches, so its freeze still decides where new ones land. */
function gathering(request: FreezeFields): boolean {
  return !PAST_FREEZE.has(request.state ?? '');
}

/** What a frozen chip says on hover. */
export const FROZEN_TITLE =
  'This request holds as many counted branches as the feature freeze allows: new asks queue in ' +
  'the request behind it until this one has released or been withdrawn. Joining it by its id ' +
  'still gets a branch in.';

/**
 * The chip on a frozen request, `frozen 3/3` (counted branches of the threshold); null while it is
 * not frozen, once it has released, or when the answer carries no freeze.
 */
export function freezeChip(request: FreezeFields): {
  readonly label: string;
  readonly tone: ReleaseTone;
} | null {
  const freeze = request.featureFreeze;
  if (!freeze?.frozen || !gathering(request)) return null;
  return { label: `frozen ${freeze.features ?? 0}/${freeze.threshold ?? 0}`, tone: 'waiting' };
}

/**
 * The quiet count on an open request that is not frozen yet, `1/3`; null when the freeze is off
 * (threshold 0), nothing counts yet, it is frozen (the chip says it), it is queued (its count
 * starts once it is the active request), or it has released.
 */
export function freezeCount(request: FreezeFields): string | null {
  const freeze = request.featureFreeze;
  if (!freeze || freeze.frozen || !freeze.threshold || !freeze.features) return null;
  if (!gathering(request) || queuedBehind(request)) return null;
  return `${freeze.features ?? 0}/${freeze.threshold}`;
}

/** The id a link to a queue neighbour uses: its logical id when it has one, else its uuid. */
function neighbour(qualifiedId: string | null | undefined, id: string | null | undefined) {
  const ref = qualifiedId?.trim() || id?.trim();
  return ref ? ref : null;
}

/** The request this one is queued behind (logical id, else uuid); null unless it is queued. */
export function queuedBehind(request: FreezeFields): string | null {
  return neighbour(request.queuedBehindQualifiedId, request.queuedBehind);
}

/** The request queued behind this one (logical id, else uuid); null when there is none. */
export function queuedNext(request: FreezeFields): string | null {
  return neighbour(request.queuedNextQualifiedId, request.queuedNext);
}

/**
 * The freeze as a request's facts say it: `3 of 3 counted branches · frozen · threshold from
 * project`, `1 of 3 counted branches · threshold from platform`, or `off (repository)` where the
 * threshold in force is 0. Null when the answer carries no freeze (an older qits-projects).
 */
export function freezeFact(request: FreezeFields): string | null {
  const freeze = request.featureFreeze;
  if (!freeze || freeze.threshold === undefined || freeze.threshold === null) return null;
  const source = (freeze.source ?? '').toLowerCase();
  if (freeze.threshold === 0) return source ? `off (${source})` : 'off';
  const parts = [`${freeze.features ?? 0} of ${freeze.threshold} counted branches`];
  if (freeze.frozen) parts.push('frozen');
  if (source) parts.push(`threshold from ${source}`);
  return parts.join(' · ');
}
