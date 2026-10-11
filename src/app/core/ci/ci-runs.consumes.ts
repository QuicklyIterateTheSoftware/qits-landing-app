import type { ListRunsResponses } from '../../api/ci';
import type { Consumed } from '@qits/angular';

/**
 * What `CiRunsStore` reads from qits-ci's answers. The store passes these to `consume(...)`, so it
 * cannot read any other field, and its pact spec binds exactly these fields.
 */

/**
 * A repository's newest runs: the release request page links the runs of the request (by
 * `releaseRequestId`, or by an id the request names) and says what each one is.
 */
export const LIST_REPOSITORY_RUNS = [
  'runs[].id',
  'runs[].branch',
  'runs[].commitSha',
  'runs[].status',
  'runs[].createdAt',
  'runs[].finishedAt',
  'runs[].releaseRequestId',
  'runs[].phase',
  'runs[].triggerEventName',
] as const;

/** One run, cut to what the page reads. */
export type CiRun = NonNullable<
  Consumed<ListRunsResponses[200], typeof LIST_REPOSITORY_RUNS>['runs']
>[number];
