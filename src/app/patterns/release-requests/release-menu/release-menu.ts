import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { DomainEvents } from '$core/events/domain-events';
import {
  affectsReleaseRequests,
  RELEASE_REQUEST_EVENTS,
} from '$core/projects/release-request-events';
import { ProjectsStore } from '$core/projects/projects.store';
import { SelectedProject } from '$core/projects/selected-project';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/** How long a burst of domain events waits before the requests are fetched again. */
export const REFRESH_DEBOUNCE_MS = 1_000;

/** A chip's Tailwind classes, written out in full so Tailwind finds them. */
const CHIP = {
  ok: 'bg-mint-leaf-100 text-mint-leaf-800',
  waiting: 'bg-sunflower-gold-100 text-sunflower-gold-800',
  failed: 'bg-cinnabar-100 text-cinnabar-700',
  neutral: 'bg-charcoal-brown-100 text-charcoal-brown-700',
} as const;

/** A gate's state as a chip colour: passed, waiting, failed, or not known. */
export function gateTone(state: string | undefined): keyof typeof CHIP {
  switch (state) {
    case 'PASSED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'FAILED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/** A request's state as a chip colour: on its way, waiting, or stuck. */
export function requestTone(state: string | undefined): keyof typeof CHIP {
  switch (state) {
    case 'READY':
    case 'RELEASED':
      return 'ok';
    case 'PENDING':
      return 'waiting';
    case 'REJECTED':
    case 'FAILED':
    case 'CONFLICTED':
      return 'failed';
    default:
      return 'neutral';
  }
}

/**
 * The top bar's lightning menu: the open project's pending release requests, each with its state
 * and its gates. Shown only while a project is open, like the settings gear beside it.
 *
 * The requests are fetched as soon as a project opens (`loadReleaseRequests`), so the button
 * carries their count right away (none when nothing is pending). They are fetched again when a
 * domain event says they may have changed ({@link RELEASE_REQUEST_EVENTS}, filtered to the open
 * project by `affectsReleaseRequests`), at most once a second, since one release sends several.
 * The button and the panel are `ui-dropdown`'s.
 */
@Component({
  selector: 'app-release-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Spinner],
  // One display class or the other: a static display class would beat `hidden`. `ml-auto` pushes
  // the menu and the settings gear after it to the right end of the top bar.
  host: {
    '[class]': "projectId() ? 'inline-flex' : 'hidden'",
  },
  template: `
    <ui-dropdown
      label="Release requests"
      panelLabel="Pending release requests"
      panelId="release-menu"
      (opened)="load()"
    >
      <svg
        dropdown-trigger
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
      </svg>
      <span
        dropdown-trigger
        class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-sunflower-gold-500 px-1 text-[0.625rem] leading-4 font-semibold text-charcoal-brown-950"
        [class.hidden]="!count()"
        aria-hidden="true"
        >{{ count() }}</span
      >
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 list-none p-0">
          @for (request of pending(); track request.id) {
            <li class="flex flex-col gap-1 border-b border-gray-100 px-3 py-2 last:border-b-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate text-sm font-semibold text-gray-900">{{
                  request.repoName
                }}</span>
                <span
                  class="shrink-0 rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                  [class]="chip(requestTone(request.state))"
                  >{{ request.state }}</span
                >
              </div>
              <span class="truncate text-[0.8125rem] text-gray-600">{{ request.summary }}</span>
              <span class="flex flex-wrap gap-1">
                @for (gate of request.gates ?? []; track gate.kind) {
                  <span
                    class="rounded px-1.5 text-[0.6875rem] leading-4"
                    [class]="chip(gateTone(gate.state))"
                    >{{ gate.kind }} · {{ gate.state }}</span
                  >
                }
              </span>
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || pending().length > 0"
        >
          No pending release requests
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class ReleaseMenu {
  private readonly store = inject(ProjectsStore);
  private readonly selected = inject(SelectedProject);
  protected readonly gateTone = gateTone;
  protected readonly requestTone = requestTone;

  /** The open project's id, once the list holds it. */
  protected readonly projectId = computed(() => this.selected.project()?.id);

  private readonly requests = computed(() => {
    const id = this.projectId();
    return id === undefined ? undefined : this.store.releaseRequests()[id];
  });

  protected readonly pending = computed(() => this.requests()?.pending ?? []);

  /** How many are pending, once fetched; undefined before the first opening. */
  protected readonly count = computed(() =>
    this.requests()?.status === 'loaded' ? this.pending().length : undefined,
  );

  protected readonly state = computed((): LoadState => {
    const status = this.requests()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected chip(tone: keyof typeof CHIP): string {
    return CHIP[tone];
  }

  constructor() {
    effect(() => {
      const id = this.projectId();
      if (id !== undefined) untracked(() => void this.store.loadReleaseRequests(id));
    });
    inject(DomainEvents)
      .on(RELEASE_REQUEST_EVENTS)
      .pipe(
        filter((event) => {
          const id = this.projectId();
          return id !== undefined && affectsReleaseRequests(event, id, this.pending());
        }),
        debounceTime(REFRESH_DEBOUNCE_MS),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        const id = this.projectId();
        if (id !== undefined) void this.store.refreshReleaseRequests(id);
      });
  }

  /** Fetches the open project's requests if nothing has yet (opening the menu after a failure). */
  protected load(): void {
    const id = this.projectId();
    if (id !== undefined) void this.store.loadReleaseRequests(id);
  }
}
