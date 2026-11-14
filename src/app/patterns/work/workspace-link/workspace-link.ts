import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, outcomes } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkspaceActivity } from '$core/workspaces/workspace-activity';
import { TagLink, type TagLinkVariant } from '$ui/components/tag-link/tag-link';

/**
 * A "Workspace" link to a work item's agent, `/projects/<slug>/work/detail/<qualified id>/agent`
 * (epic qits-1230), which leads on to its ACTIVE agent's page (`agents/<agent id>`, epic
 * qits-1681): the link knows the item, not its agent. It is the declared exit `open-item-workspace`
 * `open` (epic qits-2000). Shown only while the item has an ACTIVE workspace (`WorkspaceActivity.hasOpen`); otherwise
 * it hides itself. The page wants the open workspaces (`WorkspaceActivity.wantOpen()`, one read for the app); the link
 * costs no request.
 *
 * `variant` is `ui-tag-link`'s: `tag` among an item's tags (an epic's lane, a feature row's
 * `[row-footer-end]`), `corner` as a card's `[card-corner]` bubble. The host is hidden by class,
 * so a server render (which loads nothing, so shows none) hydrates as is; the link inside it is
 * rendered only while it is shown (ticket qits-2225): a hidden one is a trigger no person can
 * reach, which the outcome check would count against every route that draws the item. The server
 * renders none either way, so the browser only ever adds it.
 */
@Component({
  selector: 'app-workspace-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagLink],
  host: { '[class]': 'hostClasses()' },
  template: `
    @if (shown()) {
      <ui-tag-link
        label="Workspace"
        [exit]="opening.open"
        [exitParams]="params()"
        [variant]="variant()"
      />
    }
  `,
})
export class WorkspaceLink {
  /** The item's id: qits-projects' entity id, which qits-workspaces binds a workspace to. */
  readonly workId = input.required<string | undefined>();
  /** The item's qualified id, e.g. `qits-622`: the agent page's address. */
  readonly qualifiedId = input.required<string | undefined>();
  readonly variant = input<TagLinkVariant>('tag');

  private readonly workspaces = inject(WorkspaceActivity);
  private readonly selected = inject(SelectedProject);

  protected readonly shown = computed(() => this.workspaces.hasOpen(this.workId()));

  protected readonly hostClasses = computed(() => {
    if (!this.shown()) return 'hidden';
    return this.variant() === 'corner' ? 'block' : 'inline-block';
  });

  protected readonly opening = outcomes('open-item-workspace', {
    open: exit('projects/:slug/work/detail/:id/agent'),
  });

  protected readonly params = computed(() => ({
    slug: this.selected.slug() ?? '',
    id: this.qualifiedId() ?? '',
  }));
}
