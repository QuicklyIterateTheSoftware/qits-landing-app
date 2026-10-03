import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { WORK_DETAIL } from '$core/work/work-tabs';
import { Popover } from '$ui/components/popover/popover';
import { Tag } from '$ui/components/tag/tag';
import { TagLink } from '$ui/components/tag-link/tag-link';

/**
 * A reference to a work item by its qualified id: a tag "<Archetype>: <id>" (e.g. "Campaign:
 * qits-622"; just the id while the item is not known) that links to the item's page,
 * `/projects/<slug>/work/detail/<id>`. An id rather than a title, because titles are often too
 * long for a tag.
 *
 * While the pointer or the focus is on it, a popover previews the item: its id, archetype and
 * status, its title, and its description in a box about five lines high that scrolls. The item
 * comes from `SelectedWork`, which the work pages load already, so the preview costs no request.
 * Only a campaign's description is loaded there (`campaignDescriptions`); for any other item the
 * preview shows the header alone. The popover is always rendered and switched by CSS, so the
 * server and the browser render the same markup.
 *
 * `display: contents`, so the tag is itself the item of the row it is put in (`[lane-tags]`, say).
 */
@Component({
  selector: 'app-work-ref',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover, Tag, TagLink],
  host: { class: 'contents' },
  template: `
    <ui-popover #popover>
      <ui-tag-link [label]="label()" [link]="link()" [describedBy]="popover.panelId()" />
      <div popover-content class="flex w-72 flex-col gap-1">
        <div class="flex items-center gap-2 text-xs text-charcoal-brown-500">
          <span class="font-mono">{{ qualifiedId() }}</span>
          <span [class.hidden]="!archetype()">{{ archetype() }}</span>
          <ui-tag [label]="status()" [class.hidden]="!status()" />
        </div>
        <p class="m-0 font-semibold" [class.hidden]="!entry()?.title">{{ entry()?.title }}</p>
        <p
          class="m-0 max-h-[5em] overflow-y-auto text-xs whitespace-pre-line text-charcoal-brown-700"
          [class.hidden]="!description()"
        >
          {{ description() }}
        </p>
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

  /** The archetype as a word: `CAMPAIGN` is "Campaign". */
  protected readonly archetype = computed(() => {
    const archetype = this.entry()?.archetype ?? '';
    return archetype.charAt(0) + archetype.slice(1).toLowerCase();
  });

  protected readonly label = computed(() =>
    this.archetype() ? `${this.archetype()}: ${this.qualifiedId()}` : this.qualifiedId(),
  );

  protected readonly link = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/${WORK_DETAIL}/${this.qualifiedId()}`,
  );

  protected readonly status = computed(() => this.entry()?.status?.toLowerCase() ?? '');

  protected readonly description = computed(() => {
    const id = this.entry()?.id;
    return id ? (this.work.campaignDescriptions()[id] ?? '') : '';
  });
}
