import type { ListLocResponses } from '../../api/githost';
import type { Consumed } from '@qits/angular';

/**
 * What `LocStore` reads from qits-githost's answers (epic qits-112). The store passes these to
 * `consume(...)`, so it cannot read any other field, and its pact spec passes the same lists as
 * `consumes`, so the pact binds exactly these fields. To read another field, add it here.
 */

/** `load()`: per repository, whether it is counted, and its main and test lines per language. */
export const LIST_LOC = [
  'entries[].repositoryId',
  'entries[].status',
  'entries[].languages[].language',
  'entries[].languages[].mainLines',
  'entries[].languages[].testLines',
] as const;

/** One repository's row, cut to what the store reads. */
export type LocEntry = NonNullable<
  Consumed<ListLocResponses[200], typeof LIST_LOC>['entries']
>[number];
