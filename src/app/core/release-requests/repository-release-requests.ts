import type { RepositoryReleaseRequest } from './repository-release-requests.consumes';

/**
 * A repository's Release requests page's state filter (qits-2506), in `?state=`: all (the
 * default, so past released requests show without a click), the open ones, the released and
 * finalized ones, or the rejected and withdrawn ones.
 */
export type RequestFilter = 'all' | 'open' | 'released' | 'closed';

/** The filters in the order the page offers them, with their words. */
export const REQUEST_FILTERS: readonly { readonly key: RequestFilter; readonly label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'released', label: 'Released' },
  { key: 'closed', label: 'Rejected or withdrawn' },
];

/** The filter a `?state=` value names; anything else is all. */
export function requestFilterOf(value: string | null | undefined): RequestFilter {
  return REQUEST_FILTERS.find((filter) => filter.key === value)?.key ?? 'all';
}

/**
 * The `state` the door is asked for: none for the open ones (the door's default, which adds the
 * last ten released), `all` for the whole history, which the released and closed filters narrow
 * in the page (each holds more than one state).
 */
export function stateQueryOf(filter: RequestFilter): string | undefined {
  return filter === 'open' ? undefined : 'all';
}

const RELEASED: ReadonlySet<string> = new Set(['RELEASED', 'FINALIZED']);
const CLOSED: ReadonlySet<string> = new Set(['REJECTED', 'WITHDRAWN', 'OBSOLETE']);
const DONE: ReadonlySet<string> = new Set([...RELEASED, ...CLOSED, 'FAILED', 'CONFLICTED']);

/** The requests `filter` keeps of the door's answer, in its order (newest first). */
export function filterRequests(
  requests: readonly RepositoryReleaseRequest[],
  filter: RequestFilter,
): readonly RepositoryReleaseRequest[] {
  const state = (request: RepositoryReleaseRequest) => request.state ?? '';
  switch (filter) {
    case 'released':
      return requests.filter((request) => RELEASED.has(state(request)));
    case 'closed':
      return requests.filter((request) => CLOSED.has(state(request)));
    case 'open':
      return requests.filter((request) => !DONE.has(state(request)));
    default:
      return requests;
  }
}

/** How many rows a page shows at first, and how many more each "Show more" adds. */
export const REQUESTS_CHUNK = 50;
