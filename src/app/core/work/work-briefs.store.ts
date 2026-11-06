import { makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { consume } from '@qits/angular';
import {
  provideQitsWorkBriefs,
  QITS_WORK_LINK,
  type QitsWorkBrief,
  type QitsWorkBriefSource,
  type QitsWorkLinkFactory,
} from '@qits/ui-components';
import { listProjectWorkBriefs } from '../../api/projects';
import { LIST_PROJECT_WORK_BRIEFS } from './work-briefs.consumes';
import { WORK_DETAIL } from './work-tabs';

/**
 * The briefs of the work items commit subjects name (qits-1897), for `@qits/ui-components`'
 * `<qits-commit-message>`: qits-projects' `listProjectWorkBriefs`, through this app's generated
 * client (so on qits-projects' origin from `PlatformOrigins`, with the bearer), instead of the
 * library's default read, which looks qits-projects up in a `/main-navigation` this app does not
 * read.
 *
 * `QitsWorkBriefs` (the library's, root) batches every id one view renders into one call per
 * project and keeps every answer, so this is called once per project and batch; it asks nothing
 * on the server. The ids go as ONE `id` parameter, comma-separated (`id=qits-1,qits-2`), the form
 * qits-projects' golden master records. An id qits-projects does not know is simply missing from
 * the answer; a failed read rejects, and the library leaves every id of the call plain text.
 *
 * The library's brief also names the item's `id` and `archetype`, which its popover does not show:
 * this app reads neither (`LIST_PROJECT_WORK_BRIEFS`), so they are filled with the qualified id and
 * `''`.
 *
 * Staleness (qits-1270): none. A brief is a hint beside a commit subject, kept for the life of the
 * app by the library; a status that moved shows on the next load.
 */
export const workBriefSource: QitsWorkBriefSource = async (project, ids) => {
  const { data, error } = await consume(
    listProjectWorkBriefs({
      path: { project },
      query: { id: [...ids] },
      querySerializer: { array: { explode: false, style: 'form' } },
    }),
    LIST_PROJECT_WORK_BRIEFS,
  );
  if (error !== undefined || !data) throw new Error('The work briefs could not be read');
  return (data.briefs ?? []).map((brief): QitsWorkBrief => ({
    id: brief.qualifiedId,
    qualifiedId: brief.qualifiedId,
    archetype: '',
    status: brief.status,
    title: brief.title,
    updatedAt: brief.updatedAt,
  }));
};

/** A work reference leads to the item's page in this app: `/projects/<slug>/work/detail/<id>`. */
export const workLink: QitsWorkLinkFactory = (project, qualifiedId) => ({
  routerLink: ['/projects', project, 'work', WORK_DETAIL, qualifiedId],
});

/**
 * The work references in commit subjects (`<qits-commit-message>`): briefs from
 * {@link workBriefSource}, links from {@link workLink}.
 */
export function provideWorkReferences(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideQitsWorkBriefs(workBriefSource),
    { provide: QITS_WORK_LINK, useValue: workLink },
  ]);
}
