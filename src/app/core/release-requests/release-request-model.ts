import type { ReleaseTone } from '$core/projects/release-requests';
import type { ReleaseConflict, ReleaseRequest, ReleaseSource } from './release-request.consumes';

/**
 * Pure rules about one release request, ported from qits-projects-frontend's
 * `release-requests-model.ts`. The page and its panels read them; nothing here calls a service.
 */

/** A chip: its label and tone. */
export interface ReleaseBadge {
  readonly label: string;
  readonly tone: ReleaseTone;
}

/** States in which nothing moves by itself any more. FAILED counts only when not retryable. */
const SETTLED_STATES: ReadonlySet<string> = new Set([
  'FINALIZED',
  'REJECTED',
  'CONFLICTED',
  'WITHDRAWN',
  'OBSOLETE',
]);

/** States past the point where the request can be withdrawn or re-prioritised: the tag is cut. */
const CLOSED_TO_CHANGE: ReadonlySet<string> = new Set([
  'RELEASED',
  'FINALIZED',
  'WITHDRAWN',
  'OBSOLETE',
]);

/** The priorities a branch can carry, lowest first. */
export const RELEASE_PRIORITIES: readonly string[] = [
  'LOWEST',
  'LOW',
  'MEDIUM',
  'HIGH',
  'HIGHER',
  'BLOCKING',
];

const PRIORITY_TONES: Readonly<Record<string, ReleaseTone>> = {
  HIGH: 'waiting',
  HIGHER: 'waiting',
  BLOCKING: 'failed',
};

/** The request can still be withdrawn or have a branch's priority changed. */
export function isChangeable(request: Pick<ReleaseRequest, 'state'>): boolean {
  return !CLOSED_TO_CHANGE.has(request.state ?? '');
}

/** A tag has been cut: RELEASED or FINALIZED. */
export function hasReleased(request: ReleaseRequest): boolean {
  return request.state === 'RELEASED' || request.state === 'FINALIZED';
}

/** A person must still approve or decline the current fold. */
export function approvalOutstanding(request: ReleaseRequest): boolean {
  if (request.approvalRequired !== true) return false;
  const word = request.approvalState;
  return word !== 'APPROVED' && word !== 'DECLINED';
}

/** The request waits for a person's approval (it is PENDING and the approval is outstanding). */
export function awaitingApproval(request: ReleaseRequest): boolean {
  return request.state === 'PENDING' && approvalOutstanding(request);
}

/**
 * Nothing on the request moves by itself any more. A FAILED request that the service will retry
 * is not settled; one it will not retry is.
 */
export function isSettled(request: ReleaseRequest): boolean {
  if (request.state === 'FAILED') return !request.retryable;
  return SETTLED_STATES.has(request.state ?? '');
}

/** A priority as a chip, or null when there is none. */
export function priorityBadge(priority: string | null | undefined): ReleaseBadge | null {
  const word = priority?.trim();
  if (!word) return null;
  return { label: word.toLowerCase(), tone: PRIORITY_TONES[word] ?? 'neutral' };
}

/** The priorities to offer for a branch: the known ones, plus its own if the service sent another. */
export function priorityOptions(current: string | null | undefined): readonly string[] {
  const word = current?.trim();
  return word && !RELEASE_PRIORITIES.includes(word)
    ? [...RELEASE_PRIORITIES, word]
    : RELEASE_PRIORITIES;
}

/** A branch added automatically (an unmerged earlier release) has no priority of its own to set. */
export function canPrioritiseSource(source: ReleaseSource): boolean {
  return !source.implicit;
}

/** The service's detail sentence, or null when it is blank. */
export function releaseDetail(request: ReleaseRequest): string | null {
  const detail = request.detail?.trim();
  return detail ? detail : null;
}

/** The sources, the named branches first and the automatic ones after. */
export function releaseSources(request: ReleaseRequest): readonly ReleaseSource[] {
  return [...(request.sources ?? [])].sort(
    (left, right) => Number(!!left.implicit) - Number(!!right.implicit),
  );
}

/** A ref without its `refs/heads/` or `refs/tags/` prefix. */
export function refName(ref: string | null | undefined): string {
  return (ref ?? '').replace(/^refs\/(?:heads|tags)\//, '');
}

/** A source's tooltip: its ref, and for an automatic one, why it is there. */
export function sourceTitle(source: ReleaseSource): string {
  return source.implicit
    ? `${source.ref} — a release of this repository that has not reached main yet, added automatically`
    : (source.ref ?? '');
}

/** The conflict, or null when the request has none with paths. */
export function releaseConflict(request: ReleaseRequest): ReleaseConflict | null {
  const conflict = request.conflict;
  return conflict && conflict.conflicts?.length ? conflict : null;
}

/** What a missing value reads as. */
export const NONE = '—';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (value: number) => value.toString().padStart(2, '0');

/** An instant in UTC to the second, `9 Oct 2026 14:05:09Z`, for a tooltip; {@link NONE} if missing. */
export function formatInstant(iso: string | null | undefined): string {
  const date = parseInstant(iso);
  if (!date) return NONE;
  return (
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * How long ago `iso` was: "just now", "5m ago", "3h ago", "2d ago", and the date after 30 days;
 * {@link NONE} if missing.
 */
export function formatRelativeTime(iso: string | null | undefined, nowMs = Date.now()): string {
  const date = parseInstant(iso);
  if (!date) return NONE;
  const seconds = Math.round((nowMs - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The first seven characters of a sha, or {@link NONE}. */
export function shortShaOrNone(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : NONE;
}

/** Why a change was refused, for a person to read: the HTTP status and the service's message. */
export function describeRefusal(status: number, message: string | undefined): string {
  if (status === 0) return 'the service is unreachable';
  return message ? `${status} ${message}` : `${status}`;
}
