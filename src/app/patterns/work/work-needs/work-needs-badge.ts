import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { needLine, unmetCount, unmetNeeds, type NeedView } from '$core/work/work-needs';
import { Popover } from '$ui/components/popover/popover';

/**
 * A work item's "needs" badge (epic qits-1899): `needs <n>` while `n` of the items it needs are
 * not at their status yet, and nothing at all once every need is met (or it has none). Hovering or
 * focusing it lists those needs, one per line: `qits-1897 at VERIFIED (now REFINED)`.
 *
 * Apart from the BLOCKED mark (a problem found during work, cinnabar) and an agent's wait (the
 * word "waiting", sunflower gold): a need is foreseeable ordering, so the badge is ocean blue with
 * a dashed border, and it never says "waiting". Its accessible name says it in full.
 *
 * `display: contents`, so the badge is itself an item of the row it is put in (a card's tags, a
 * lane's tags, the item page's facts). It is positioned, so it sits above a card's stretched title
 * link and takes the pointer itself.
 */
@Component({
  selector: 'app-work-needs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Popover],
  host: { class: 'contents' },
  template: `
    @if (count() > 0) {
      <ui-popover #popover class="relative z-10">
        <span
          class="inline-block rounded-sm border border-dashed border-ocean-deep-400 bg-ocean-deep-50 px-1.5 text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-ocean-deep-800"
          tabindex="0"
          data-work-needs
          [attr.aria-label]="name()"
          [attr.aria-describedby]="popover.panelId()"
          >needs {{ count() }}</span
        >
        <ul popover-content class="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-xs">
          @for (need of unmetList(); track need.qualifiedId) {
            <li data-work-need-line>{{ line(need) }}</li>
          }
        </ul>
      </ui-popover>
    }
  `,
})
export class WorkNeedsBadge {
  /** What the item needs, met or not. */
  readonly needs = input<readonly NeedView[] | null | undefined>([]);
  /** How many of them are not met, as the read counts them; counted from `needs` when absent. */
  readonly unmet = input<number | null | undefined>(undefined);

  protected readonly count = computed(() => unmetCount(this.needs(), this.unmet()));

  /** The needs the tooltip lists: those not met yet. */
  protected readonly unmetList = computed(() => unmetNeeds(this.needs()));

  protected readonly name = computed(() => {
    const n = this.count();
    return n === 1
      ? 'Needs 1 item not at its status yet'
      : `Needs ${n} items not at their status yet`;
  });

  protected readonly line = needLine;
}
