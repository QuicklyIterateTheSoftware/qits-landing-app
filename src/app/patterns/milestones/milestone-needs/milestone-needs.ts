import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { needsLabel, unmetOf, type MilestoneRef } from '$core/milestones/milestone-criteria';
import { milestonePath } from '$core/milestones/milestone-path';
import { SelectedProject } from '$core/projects/selected-project';

/**
 * The "needs" marks of a work item or a campaign membership (epic qits-615): one per milestone it
 * needs that is not met yet, "⚑ needs: <milestone name>", linking the milestone's page. A met
 * milestone draws nothing; with none unmet, nothing is drawn at all.
 *
 * Apart from the BLOCKED mark (a problem found during work, cinnabar) and an agent's wait (the
 * word "waiting", sunflower gold): a milestone is foreseeable, so its mark is ocean blue with a
 * dashed border and a flag, and it never says "waiting". Its accessible name says it in full:
 * "Needs milestone <name>, not met yet".
 *
 * `display: contents`, so each mark is itself an item of the row it is put in (a card's tags, a
 * lane's tags, the item page's facts). Each link is positioned, so it sits above a card's
 * stretched title link and takes its own clicks.
 */
@Component({
  selector: 'app-milestone-needs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `
    @for (milestone of unmet(); track milestone.id) {
      <a
        class="relative z-10 inline-flex w-fit items-center gap-1 rounded-sm border border-dashed border-ocean-deep-400 bg-ocean-deep-50 px-1.5 text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-ocean-deep-800 no-underline hover:underline"
        data-milestone-needs
        [routerLink]="link(milestone)"
        [attr.aria-label]="'Needs milestone ' + (milestone.displayName ?? '') + ', not met yet'"
        ><span aria-hidden="true">⚑</span>{{ label(milestone) }}</a
      >
    }
  `,
})
export class MilestoneNeeds {
  /** The milestones the item or membership needs, met or not. */
  readonly milestones = input<readonly MilestoneRef[] | null | undefined>([]);

  private readonly selected = inject(SelectedProject);

  /** Only the milestones not met yet: a met one needs nothing more. */
  protected readonly unmet = computed(() => unmetOf(this.milestones()));

  protected readonly label = needsLabel;

  protected link(milestone: MilestoneRef): string {
    return milestonePath(this.selected.slug() ?? '', milestone.id);
  }
}
