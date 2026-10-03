import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { WorkspacesStore } from '$core/workspaces/workspaces.store';
import { TagLink, type TagLinkVariant } from '$ui/components/tag-link/tag-link';

/**
 * A "Workspace" link to a work item's workspace page, `/projects/<slug>/workspaces/<qualified
 * id>`, shown only while the item has an ACTIVE workspace (`WorkspacesStore.hasOpen`); otherwise
 * it hides itself. The page loads the open workspaces once (`WorkspacesStore.load()`); the link
 * costs no request.
 *
 * `variant` is `ui-tag-link`'s: `tag` among an item's tags (an epic's lane, a feature row's
 * `[row-footer-end]`, a campaign's status), `corner` as a card's `[card-corner]` bubble. Hidden by
 * class, never by `@if`, so a server render (which loads nothing, so shows none) hydrates as is.
 */
@Component({
  selector: 'app-workspace-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagLink],
  host: { '[class]': 'hostClasses()' },
  template: `<ui-tag-link label="Workspace" [link]="link()" [variant]="variant()" />`,
})
export class WorkspaceLink {
  /** The item's id: qits-projects' entity id, which qits-workspaces binds a workspace to. */
  readonly workId = input.required<string | undefined>();
  /** The item's qualified id, e.g. `qits-622`: the workspace page's address. */
  readonly qualifiedId = input.required<string | undefined>();
  readonly variant = input<TagLinkVariant>('tag');

  private readonly workspaces = inject(WorkspacesStore);
  private readonly selected = inject(SelectedProject);

  protected readonly shown = computed(() => this.workspaces.hasOpen(this.workId()));

  protected readonly hostClasses = computed(() => {
    if (!this.shown()) return 'hidden';
    return this.variant() === 'corner' ? 'block' : 'inline-block';
  });

  protected readonly link = computed(
    () => `/projects/${this.selected.slug() ?? ''}/workspaces/${this.qualifiedId() ?? ''}`,
  );
}
