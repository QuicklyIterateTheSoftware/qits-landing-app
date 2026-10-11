import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { BranchLane } from '$core/release-requests/branch-graph';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  canPrioritiseSource,
  describeRefusal,
  isChangeable,
  priorityBadge,
  priorityOptions,
  sourceTitle,
} from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import { Chip } from '$ui/components/chip/chip';

/** What a lane that is not a source says under its name. */
const KIND_NOTES: Readonly<Record<BranchLane['kind'], string>> = {
  backing: 'the fold',
  source: '',
  other: 'no source reaches these',
};

/**
 * The column header over one lane of a release request's commit graph (ported from
 * qits-projects-frontend's `release-sources`): the lane's branch name, cut to the column with the
 * full name in its tooltip, and under it, for a named source branch, its priority as a select. The
 * select is disabled, not hidden, once the request can no longer change (a tag is cut). A source
 * the service added (a released tag that has not reached main) shows "tag" and its priority as a
 * chip; the backing branch, "other" and guessed lanes say what they are.
 *
 * A change goes to qits-projects at once (`ReleaseRequestStore.setSourcePriority`); the answered
 * request takes the shown one's place. A refusal is said under the select, which goes back.
 */
@Component({
  selector: 'app-release-lane-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  host: { class: 'block min-w-0' },
  template: `
    <p class="m-0 truncate font-mono text-xs font-semibold" [title]="title()">
      {{ lane().label }}
    </p>
    @if (source(); as source) {
      @if (prioritisable(source)) {
        <!-- The chosen option carries "selected" rather than the select a bound value: a value
             bound on the select is written before its options exist. -->
        <select
          class="mt-0.5 w-full rounded border border-charcoal-brown-300 bg-white px-0.5 text-xs disabled:opacity-60"
          [attr.aria-label]="'Priority of ' + source.name"
          [disabled]="!settable() || busy()"
          (change)="choose($event)"
        >
          @if (!source.priority) {
            <option value="" selected>unset</option>
          }
          @for (option of options(); track option) {
            <option [value]="option" [selected]="option === source.priority">
              {{ option.toLowerCase() }}
            </option>
          }
        </select>
      } @else {
        <div class="mt-0.5 flex flex-wrap gap-1">
          <ui-chip label="tag" />
          @if (badge(); as chip) {
            <ui-chip [label]="chip.label" [tone]="chip.tone" />
          }
        </div>
      }
    } @else {
      <p class="m-0 mt-0.5 truncate text-xs text-charcoal-brown-500">{{ note() }}</p>
    }
    @if (failure(); as failure) {
      <p class="m-0 mt-0.5 text-xs break-words text-cinnabar-700" role="alert">
        Not set — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseLaneHeader {
  private readonly store = inject(ReleaseRequestStore);

  readonly lane = input.required<BranchLane>();
  readonly request = input.required<ReleaseRequest>();

  /** The source this lane is, if it is one. */
  protected readonly source = computed(() =>
    this.lane().kind === 'source'
      ? (this.request().sources ?? []).find((source) => source.name === this.lane().label)
      : undefined,
  );

  protected readonly prioritisable = canPrioritiseSource;
  protected readonly settable = computed(() => isChangeable(this.request()));
  protected readonly options = computed(() => priorityOptions(this.source()?.priority));
  protected readonly badge = computed(() => priorityBadge(this.source()?.priority));
  protected readonly note = computed(() => KIND_NOTES[this.lane().kind]);

  protected readonly title = computed(() => {
    const source = this.source();
    return source ? sourceTitle(source) : this.lane().label;
  });

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected async choose(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const source = this.source();
    const priority = select.value;
    if (!source?.name || !priority || priority === source.priority) return;
    const request = this.request();
    this.busy.set(true);
    this.failure.set(null);
    const outcome = await this.store.setSourcePriority(
      request.repoId ?? '',
      request.id ?? '',
      source.name,
      priority,
    );
    this.busy.set(false);
    if (!outcome.request) {
      this.failure.set(describeRefusal(outcome.status, outcome.message));
      select.value = source.priority ?? '';
    }
  }
}
