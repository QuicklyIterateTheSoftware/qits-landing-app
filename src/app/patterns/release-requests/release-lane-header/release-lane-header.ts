import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { BranchLane } from '$core/release-requests/branch-graph';
import type { ReleaseRequest } from '$core/release-requests/release-request.consumes';
import {
  canMoveSource,
  canPrioritiseSource,
  DEFAULT_MAIN_BRANCH,
  describeRefusal,
  isChangeable,
  priorityBadge,
  priorityOptions,
  sourceMarks,
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
 * chip; the backing branch, "other" and guessed lanes say what they are. Under a source, its
 * soft-feature-freeze markers (epic qits-1580): `counted` toward the freeze, `joined` past it.
 *
 * A change goes to qits-projects at once (`ReleaseRequestStore.setSourcePriority`); the answered
 * request takes the shown one's place. A refusal is said under the select, which goes back.
 *
 * "Move to next request" (qits-1665), under a source that alone may hold the request back: shown
 * where `canMoveSource` holds (a named branch that is not the repository's default `mainBranch`,
 * on an open request that is not queued and keeps another branch). The first press asks for the
 * reason, which is required; Move sends it (`ReleaseRequestStore.moveSource`), and both requests
 * the answer names take the shown ones' place. A refusal is said under it in the service's words.
 * The app reads no roles of its own, so who may move (qits:admin, qits:admin-agent, the project's
 * delivery desk) is the service's to say: a 403 hides the action for the rest of the visit, as the
 * automations waiver does.
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
      @if (marks().length) {
        <div class="mt-0.5 flex flex-wrap gap-1">
          @for (mark of marks(); track mark.label) {
            <ui-chip [label]="mark.label" [tone]="mark.tone" [title]="mark.title" />
          }
        </div>
      }
      @if (movable()) {
        @if (moving()) {
          <input
            class="mt-0.5 w-full rounded border border-charcoal-brown-300 px-0.5 text-xs"
            type="text"
            [value]="reason()"
            (input)="reasonTyped($event)"
            placeholder="Why (required)"
            [attr.aria-label]="'Reason for moving ' + source.name + ' to the next request'"
          />
          <div class="mt-0.5 flex flex-wrap gap-1">
            <button
              type="button"
              class="cursor-pointer rounded border border-charcoal-brown-300 bg-white px-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="!reason().trim() || moving() === 'sending'"
              (click)="move()"
            >
              Move
            </button>
            <button
              type="button"
              class="cursor-pointer rounded border border-transparent px-1 text-xs text-charcoal-brown-600 disabled:cursor-not-allowed disabled:opacity-60"
              [disabled]="moving() === 'sending'"
              (click)="cancelMove()"
            >
              Cancel
            </button>
          </div>
        } @else {
          <button
            type="button"
            class="mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-left text-xs text-ocean-deep-700 hover:underline"
            title="Take this branch out of this request into the one queued after it, so the others release without it"
            (click)="openMove()"
          >
            Move to next request
          </button>
        }
      }
    } @else {
      <p class="m-0 mt-0.5 truncate text-xs text-charcoal-brown-500">{{ note() }}</p>
    }
    @if (failure(); as failure) {
      <p class="m-0 mt-0.5 text-xs break-words text-cinnabar-700" role="alert">
        Not set — {{ failure }}.
      </p>
    }
    @if (moveFailure(); as failure) {
      <p class="m-0 mt-0.5 text-xs break-words text-cinnabar-700" role="alert">
        Not moved — {{ failure }}.
      </p>
    }
  `,
})
export class ReleaseLaneHeader {
  private readonly store = inject(ReleaseRequestStore);

  readonly lane = input.required<BranchLane>();
  readonly request = input.required<ReleaseRequest>();
  /** The repository's default branch, which every request carries and no move takes away. */
  readonly mainBranch = input<string>(DEFAULT_MAIN_BRANCH);

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

  /** The source's freeze markers (epic qits-1580): counted toward it, or joined past it. */
  protected readonly marks = computed(() => {
    const source = this.source();
    return source ? sourceMarks(source) : [];
  });

  protected readonly title = computed(() => {
    const source = this.source();
    return source ? sourceTitle(source) : this.lane().label;
  });

  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Refused 403 once: this viewer may not move sources, so the action stays hidden. */
  private readonly forbidden = signal(false);

  /** The source may move to the request queued after this one (qits-1665). */
  protected readonly movable = computed(() => {
    const source = this.source();
    return (
      !!source && !this.forbidden() && canMoveSource(this.request(), source, this.mainBranch())
    );
  });

  /** Pressed once: the reason shows (`asking`); `sending` while the move is in flight. */
  protected readonly moving = signal<false | 'asking' | 'sending'>(false);
  protected readonly reason = signal('');
  protected readonly moveFailure = signal<string | null>(null);

  protected openMove(): void {
    this.reason.set('');
    this.moveFailure.set(null);
    this.moving.set('asking');
  }

  protected cancelMove(): void {
    this.moving.set(false);
    this.reason.set('');
  }

  protected reasonTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  protected async move(): Promise<void> {
    const source = this.source();
    const reason = this.reason().trim();
    if (!source?.name || !reason) return;
    const request = this.request();
    this.moving.set('sending');
    this.moveFailure.set(null);
    const outcome = await this.store.moveSource(
      request.repoId ?? '',
      request.id ?? '',
      source.name,
      reason,
    );
    this.moving.set(false);
    this.reason.set('');
    if (outcome.from) return;
    if (outcome.status === 403) this.forbidden.set(true);
    this.moveFailure.set(describeRefusal(outcome.status, outcome.message));
  }

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
