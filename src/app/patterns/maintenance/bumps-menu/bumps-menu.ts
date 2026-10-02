import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { DomainEvents } from '../../../core/events/domain-events';
import type { BumpEntry } from '../../../core/maintenance/maintenance.consumes';
import { MaintenanceStore } from '../../../core/maintenance/maintenance.store';
import { Dropdown } from '../../../ui/components/dropdown/dropdown';
import { Spinner, type LoadState } from '../../../ui/components/spinner/spinner';

/**
 * The domain events after which bumps may have moved: a release or an artifact that makes a bump
 * owed, a build that ends a bump's run, and a release request that changes a bump's release.
 */
export const BUMP_EVENTS = [
  'SoftwareRelease',
  'SCMRelease',
  'BuildSuccessful',
  'BuildFailed',
  'ReleaseRequestChanged',
] as const;

/** How long a burst of domain events waits before the bumps are fetched again. */
export const REFRESH_DEBOUNCE_MS = 1_000;

/** How many of a bump's changes a row names before it says how many more there are. */
export const CHANGES_SHOWN = 3;

/** A chip's Tailwind classes, written out in full so Tailwind finds them. */
const CHIP = {
  running: 'bg-ocean-deep-100 text-ocean-deep-800',
  waiting: 'bg-sunflower-gold-100 text-sunflower-gold-800',
  neutral: 'bg-charcoal-brown-100 text-charcoal-brown-700',
} as const;

/** How a pending bump stands, in a word: its run, or, once green, its release. */
export function bumpState(bump: BumpEntry): { label: string; tone: keyof typeof CHIP } {
  if (bump.status === 'REQUESTED' || bump.status === 'RUNNING') {
    return { label: bump.status, tone: 'running' };
  }
  return { label: bump.releaseState ?? 'RELEASE OWED', tone: 'waiting' };
}

/**
 * The top bar's bumps menu (a lighthouse): the version bumps qits-maintenance has under way across
 * the platform — each one's repository, what it moves, its mode and how it stands. Always shown,
 * because bumps are the platform's, not a project's.
 *
 * The bumps are fetched the first time the menu opens, never before (`MaintenanceStore.load`), and
 * again after domain events that move them ({@link BUMP_EVENTS}), at most once a second. The button
 * and the panel are `ui-dropdown`'s; the list scrolls inside the panel.
 */
@Component({
  selector: 'app-bumps-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, Spinner],
  host: { class: 'inline-flex' },
  template: `
    <ui-dropdown
      label="Version bumps"
      panelLabel="Pending version bumps"
      panelId="bumps-menu"
      (opened)="store.load()"
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
        <path d="M9 22l1-11h4l1 11z" />
        <path d="M8 11h8" />
        <path d="M10 7h4v4h-4z" />
        <path d="M12 3v4" />
        <path d="M4 6l3 1.5M20 6l-3 1.5M4 11h2M20 11h-2" />
      </svg>
      <ui-spinner dropdown-panel [state]="state()" class="min-h-16">
        <ul class="m-0 max-h-96 list-none overflow-y-auto p-0">
          @for (bump of store.pending(); track bump.id) {
            <li class="flex flex-col gap-1 border-b border-gray-100 px-3 py-2 last:border-b-0">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate text-sm font-semibold text-gray-900">{{
                  bump.repository
                }}</span>
                <span class="flex shrink-0 gap-1">
                  <span
                    class="rounded bg-charcoal-brown-100 px-1.5 text-[0.6875rem] leading-4 text-charcoal-brown-700"
                    >{{ bump.mode }}</span
                  >
                  <span
                    class="rounded px-1.5 text-[0.6875rem] leading-4 font-semibold"
                    [class]="chip(bump)"
                    >{{ label(bump) }}</span
                  >
                </span>
              </div>
              <ul class="m-0 list-none p-0">
                @for (change of shown(bump); track $index) {
                  <li class="truncate text-[0.8125rem] text-gray-600">
                    <span class="text-gray-900">{{ change.name }}</span>
                    {{ change.from }} → {{ change.to }}
                    <span class="text-[0.6875rem] text-gray-500">{{
                      change.ecosystem?.toLowerCase()
                    }}</span>
                  </li>
                }
              </ul>
              <span class="text-[0.6875rem] text-gray-500" [class.hidden]="!more(bump)"
                >+{{ more(bump) }} more</span
              >
            </li>
          }
        </ul>
        <p
          class="m-0 px-3 py-4 text-center text-sm text-gray-500"
          [class.hidden]="state() !== 'loaded' || store.pending().length > 0"
        >
          No pending version bumps
        </p>
      </ui-spinner>
    </ui-dropdown>
  `,
})
export class BumpsMenu {
  protected readonly store = inject(MaintenanceStore);

  protected readonly state = computed((): LoadState => {
    const status = this.store.status();
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  constructor() {
    inject(DomainEvents)
      .on(BUMP_EVENTS)
      .pipe(debounceTime(REFRESH_DEBOUNCE_MS), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => void this.store.refresh());
  }

  protected shown(bump: BumpEntry) {
    return (bump.changes ?? []).slice(0, CHANGES_SHOWN);
  }

  protected more(bump: BumpEntry): number {
    return Math.max(0, (bump.changes ?? []).length - CHANGES_SHOWN);
  }

  protected label(bump: BumpEntry): string {
    return bumpState(bump).label;
  }

  protected chip(bump: BumpEntry): string {
    return CHIP[bumpState(bump).tone];
  }
}
