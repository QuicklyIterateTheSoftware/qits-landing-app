import { exit, outcomes } from '@qits/angular';
import type { InteractionSlug } from '../app/interactions';

/**
 * The exits the dumb components' specs (`src/app/ui/`, synthetic inputs) hand a primitive that
 * links (`ui-board-card`, `ui-tag-link`, `ui-breadcrumbs`: they take an exit and its params, never a
 * path). Call it in
 * a field initializer (an injection context), as `outcomes()` needs.
 *
 * The interaction is a slug no file declares, on purpose: a primitive's screenshot must never count
 * as showing a real outcome's trigger to the outcome check (`qits-angular screenshots --check
 * --enforce-outcomes`), which reads the marks in every freeze. So the slug is cast, and it is not in
 * `INTERACTIONS`.
 */
export function uiSpecExits() {
  return outcomes('ui-spec' as InteractionSlug, {
    home: exit(''),
    projects: exit('projects'),
    project: exit('projects/:slug'),
    work: exit('projects/:slug/work'),
    item: exit('projects/:slug/work/detail/:id'),
    agent: exit('projects/:slug/work/detail/:id/agent'),
  });
}
