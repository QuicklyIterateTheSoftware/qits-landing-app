import type {
  ListProjectReleaseRequestsResponses,
  GetProjectResponses,
  ListProjectsResponses,
} from '../../api/projects';
import { NOTHING, type Consumed } from '@qits/angular';

/**
 * What `ProjectsStore` reads from each qits-projects answer (epic qits-546). The store passes
 * these to `consume(...)`, so it cannot read any other field, and its pact spec passes the same
 * lists as `consumes`, so the pact binds exactly these fields. To read another field, add it here.
 */

/** `load()` / `refresh()`: the picker's cards show each project's name and link to its slug. */
export const LIST_PROJECTS = [
  'entries[].project.id',
  'entries[].project.name',
  'entries[].project.slug',
] as const;

/** `refresh(id)`: the fetched project joins the list, so it needs the same fields. */
export const GET_PROJECT = ['project.id', 'project.name', 'project.slug'] as const;

/**
 * `loadReleaseRequests(projectId)`: the top bar's release menu lists each pending request with its
 * repository, summary and state, then its two phases (qits-1133): P1 Pre-run (`preRun.state`, null
 * on rows older than the pre-run) and P2 Test (the `ci` quality gate), the rest of its quality
 * gates, and a cog counting the merge plus every automation kind that applies to it (`automations`,
 * null until qits-projects has asked qits-maintenance). qits-projects answers the open requests plus
 * the last few FINALIZED ones; the menu keeps the pending ones ({@link isPendingRelease}).
 */
export const LIST_PROJECT_RELEASE_REQUESTS = [
  'requests[].id',
  'requests[].repoName',
  'requests[].summary',
  'requests[].state',
  'requests[].preRun.state',
  'requests[].qualityGates[].kind',
  'requests[].qualityGates[].label',
  'requests[].qualityGates[].state',
  'requests[].automations[].kind',
  'requests[].automations[].label',
  'requests[].automations[].state',
  'requests[].automations[].detail',
] as const;

/** One release request, cut to what the menu reads. */
export type ReleaseRequestEntry = NonNullable<
  Consumed<
    ListProjectReleaseRequestsResponses[200],
    typeof LIST_PROJECT_RELEASE_REQUESTS
  >['requests']
>[number];

/**
 * The states in which a release request is still open work: qits-projects' own open set
 * (`ReleaseRequestRepository.OPEN`). RELEASED is in it — the tag is cut but the release has still to
 * publish, deploy and reach `main` — and FINALIZED, WITHDRAWN and OBSOLETE are not.
 */
const PENDING_RELEASE_STATES: ReadonlySet<string> = new Set([
  'PENDING',
  'READY',
  'RELEASED',
  'FAILED',
  'REJECTED',
  'CONFLICTED',
]);

/** Whether the release menu lists this request: it is still open work. */
export function isPendingRelease(entry: ReleaseRequestEntry): boolean {
  return entry.state !== undefined && PENDING_RELEASE_STATES.has(entry.state);
}

/** `hasSession()`: the status only. */
export const SESSION_CHECK = NOTHING;

/** A project as the list answer gives it, cut to what the store reads. */
export type ListedProject = NonNullable<
  NonNullable<
    Consumed<ListProjectsResponses[200], typeof LIST_PROJECTS>['entries']
  >[number]['project']
>;

/** A project as the detail answer gives it, cut to what the store reads. */
export type FetchedProject = NonNullable<
  Consumed<GetProjectResponses[200], typeof GET_PROJECT>['project']
>;
