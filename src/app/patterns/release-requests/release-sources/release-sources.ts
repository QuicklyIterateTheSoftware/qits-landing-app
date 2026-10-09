import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type {
  ReleaseRequest,
  ReleaseSource,
} from '$core/release-requests/release-request.consumes';
import {
  canPrioritiseSource,
  describeRefusal,
  isChangeable,
  priorityBadge,
  priorityOptions,
  releaseSources,
  sourceTitle,
} from '$core/release-requests/release-request-model';
import { ReleaseRequestStore } from '$core/release-requests/release-request.store';
import { Chip } from '$ui/components/chip/chip';

/**
 * A request's source branches, the named ones first, each with its priority (ported from
 * qits-projects-frontend's `release-sources`). A named branch's priority is a select while the
 * request can still change (no tag cut yet); it is disabled, not hidden, after. A branch added
 * automatically (an earlier release that has not reached main) shows its priority as a chip.
 *
 * A change goes to qits-projects at once (`ReleaseRequestStore.setSourcePriority`), and the
 * answered request takes the shown one's place. A refusal is said below the list, and the select
 * goes back to the branch's priority.
 */
@Component({
  selector: 'app-release-sources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  host: { class: 'block' },
  template: `
    <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
      @for (source of sources(); track source.ref) {
        <li
          class="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm"
          [class]="
            source.implicit
              ? 'border-dashed border-charcoal-brown-300 text-charcoal-brown-600'
              : 'border-charcoal-brown-200 text-charcoal-brown-900'
          "
          [title]="title(source)"
        >
          <span class="font-mono break-all">{{ source.name }}</span>
          @if (prioritisable(source)) {
            <!-- The chosen option carries "selected" rather than the select a bound value: a value
                 bound on the select is written before its options exist. -->
            <select
              class="rounded border border-charcoal-brown-300 bg-white px-1 text-xs disabled:opacity-60"
              [attr.aria-label]="'Priority of ' + source.name"
              [disabled]="!settable() || busy() !== null"
              (change)="choose(source, $event)"
            >
              @if (!source.priority) {
                <option value="" selected>unset</option>
              }
              @for (option of options(source); track option) {
                <option [value]="option" [selected]="option === source.priority">
                  {{ option.toLowerCase() }}
                </option>
              }
            </select>
          } @else if (priority(source); as chip) {
            <ui-chip [label]="chip.label" [tone]="chip.tone" />
          }
        </li>
      }
    </ul>
    @if (failure(); as failure) {
      <p class="mt-1 mb-0 text-sm text-cinnabar-700" role="alert">
        Could not set the priority of {{ failure.name }} — {{ failure.message }}.
      </p>
    }
  `,
})
export class ReleaseSourcesPanel {
  private readonly store = inject(ReleaseRequestStore);

  readonly request = input.required<ReleaseRequest>();

  protected readonly title = sourceTitle;
  protected readonly priority = (source: ReleaseSource) => priorityBadge(source.priority);
  protected readonly options = (source: ReleaseSource) => priorityOptions(source.priority);
  protected readonly prioritisable = canPrioritiseSource;

  protected readonly sources = computed(() => releaseSources(this.request()));

  /** No tag cut yet: priorities can still change. */
  protected readonly settable = computed(() => isChangeable(this.request()));

  /** The branch whose priority is being set. */
  protected readonly busy = signal<string | null>(null);

  protected readonly failure = signal<{ readonly name: string; readonly message: string } | null>(
    null,
  );

  protected async choose(source: ReleaseSource, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const priority = select.value;
    const name = source.name ?? '';
    if (!priority || priority === source.priority) return;
    const request = this.request();
    this.busy.set(name);
    this.failure.set(null);
    const outcome = await this.store.setSourcePriority(
      request.repoId ?? '',
      request.id ?? '',
      name,
      priority,
    );
    this.busy.set(null);
    if (!outcome.request) {
      this.failure.set({ name, message: describeRefusal(outcome.status, outcome.message) });
      select.value = source.priority ?? '';
    }
  }
}
