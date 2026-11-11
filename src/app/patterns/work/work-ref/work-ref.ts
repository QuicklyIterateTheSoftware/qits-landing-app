import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { Popover } from '$ui/components/popover/popover';
import { Tag } from '$ui/components/tag/tag';
import { TagLink } from '$ui/components/tag-link/tag-link';

/**
 * A reference to a work item by its qualified id: a tag "<Archetype>: <id>" (e.g. "Ticket:
 * qits-622"; just the id while the item is not known) that links to the item's page,
 * `/projects/<slug>/work/detail/<id>`. An id rather than a title, because titles are often too
 * long for a tag.
 *
 * While the pointer or the focus is on it, a popover previews the item: its id, archetype and
 * status, and its title. The item comes from `SelectedWork`, which the work pages load already, so
 * the preview costs no request. The popover is always rendered and switched by CSS, so the
 * server and the browser render the same markup.
 *
 * On a finger or a pen (`tapToOpen`, as `@qits/ui-components`' `<qits-work-ref>` in a commit
 * subject): a tap opens the preview without following the tag's link; a second tap, or a press
 * outside, closes it. The id in the preview is the link to the item's page.
 *
 * Both links are declared exits (epic qits-2000): `open-work-ref-tag` `open` (the tag) and
 * `openFromPreview` (the preview's id).
 *
 * `display: contents`, so the tag is itself the item of the row it is put in (`[lane-tags]`, say).
 */
@Component({
  selector: 'app-work-ref',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover, QitsExit, Tag, TagLink],
  host: { class: 'contents' },
  template: `
    <ui-popover #popover tapToOpen>
      <ui-tag-link
        [label]="label()"
        [exit]="opening.open"
        [exitParams]="params()"
        [describedBy]="popover.panelId()"
      />
      <div popover-content class="flex w-72 flex-col gap-1">
        <div class="flex items-center gap-2 text-xs text-charcoal-brown-500">
          <a
            class="font-mono hover:underline"
            [qitsExit]="opening.openFromPreview"
            [exitParams]="params()"
            >{{ qualifiedId() }}</a
          >
          <span [class.hidden]="!archetype()">{{ archetype() }}</span>
          <ui-tag [label]="status()" [class.hidden]="!status()" />
        </div>
        <p class="m-0 font-semibold" [class.hidden]="!entry()?.title">{{ entry()?.title }}</p>
      </div>
    </ui-popover>
  `,
})
export class WorkRef {
  /** The item's qualified id, e.g. `qits-622`. */
  readonly qualifiedId = input.required<string>();

  private readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);

  protected readonly entry = computed(() =>
    this.work.entries().find((e) => e.qualifiedId === this.qualifiedId()),
  );

  /** The archetype as a word: `TICKET` is "Ticket". */
  protected readonly archetype = computed(() => {
    const archetype = this.entry()?.archetype ?? '';
    return archetype.charAt(0) + archetype.slice(1).toLowerCase();
  });

  protected readonly label = computed(() =>
    this.archetype() ? `${this.archetype()}: ${this.qualifiedId()}` : this.qualifiedId(),
  );

  protected readonly opening = outcomes('open-work-ref-tag', {
    open: exit('projects/:slug/work/detail/:id'),
    openFromPreview: exit('projects/:slug/work/detail/:id'),
  });

  /** The item's page's params. */
  protected readonly params = computed(() => ({
    slug: this.selected.slug() ?? '',
    id: this.qualifiedId(),
  }));

  protected readonly status = computed(() => this.entry()?.status?.toLowerCase() ?? '');
}
