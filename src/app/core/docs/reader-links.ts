import { exit, outcomes } from '@qits/angular';

/**
 * The docs reader's link from an unknown version to the site's newest (qits-2337,
 * `leave-docs-site` `newest`). Declared here, app-wide, rather than on the reader's page: the
 * reader's page is the `read/:site` route's, while an unknown version is only ever shown on
 * `read/:site/-/:version` (or the split `read/**`), where a page-scoped declaration's trigger
 * would never count as shown. Call it from a field initializer (an injection context).
 */
export function newestVersionOutcomes() {
  return outcomes('leave-docs-site', { newest: exit('projects/:slug/docs/read/:site') });
}
