import type { ListProjectWorkBriefsResponses } from '../../api/projects';
import type { Consumed } from '@qits/angular';

/**
 * What `workBriefSource` reads from qits-projects' briefs door (`listProjectWorkBriefs`, qits-1897):
 * per named item, what a work reference's popover in a commit subject shows
 * (`<qits-commit-message>` from `@qits/ui-components`): its qualified id (to match the answer to
 * the id the subject spells), its status, its title and when it last changed. The source passes
 * this to `consume(...)`, so it cannot read any other field, and its pact spec passes the same
 * list as `consumes`. To read another field, add it here.
 */
export const LIST_PROJECT_WORK_BRIEFS = [
  'briefs[].qualifiedId',
  'briefs[].status',
  'briefs[].title',
  'briefs[].updatedAt',
] as const;

/** One item in brief, cut to what the source reads. */
export type WorkBriefEntry = NonNullable<
  Consumed<ListProjectWorkBriefsResponses[200], typeof LIST_PROJECT_WORK_BRIEFS>['briefs']
>[number];
