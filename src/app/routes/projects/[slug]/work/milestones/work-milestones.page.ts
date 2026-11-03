import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  draftProblems,
  groupSpecs,
  newGroup,
  type GroupDraft,
} from '$core/milestones/milestone-criteria';
import { milestonePath } from '$core/milestones/milestone-path';
import { MilestonesStore } from '$core/milestones/milestones.store';
import type { MilestoneEntry } from '$core/milestones/milestones.consumes';
import { utcMinute } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { MilestoneEditor } from '$patterns/milestones/milestone-editor/milestone-editor';

/** Which milestones the list shows. */
type MetFilter = 'all' | 'unmet' | 'met';

/**
 * The open project's milestones (epic qits-615), at `/projects/<slug>/work/milestones`: what work
 * needs before it may start, each a named condition shared by any number of work items and campaign
 * memberships. Each row links the milestone's page (`milestones/<id>`) and shows whether it is met
 * and since when ("met since …", or "not met"), when it was made, and how many items and
 * memberships need it. The filter (All, Not met, Met) narrows the one answer in the page
 * (`MilestonesStore.loadList`, every milestone). New milestone opens the form above the list: a
 * name and the condition (`app-milestone-editor`); Create sends `MilestonesStore.create` and goes
 * to the new milestone's page. A refusal shows in the service's words; a read that fails says so,
 * with Retry.
 *
 * Staleness (qits-1270): `MilestoneMet` or `MilestoneUnmet` whose `projectId` is the open project
 * → the list (`MilestonesStore.refreshList`, through `MilestonesStore.follow`). A milestone made,
 * renamed or attached elsewhere sends no event and shows on the next visit.
 */
@Component({
  selector: 'app-work-milestones-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActionButton,
    Chip,
    LoadFailure,
    MilestoneEditor,
    PageLayoutComponent,
    RouterLink,
    Spinner,
  ],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Milestones" [actions]="actions()">
        @if (creating()) {
          <form
            class="mb-6 flex flex-col gap-3 rounded-md border border-charcoal-brown-200 bg-white p-4"
            aria-label="New milestone"
            (submit)="$event.preventDefault()"
          >
            <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
              Name
              <input
                class="h-8 w-full max-w-md rounded-md border border-charcoal-brown-300 px-2 text-sm"
                placeholder="bootstrap test node"
                [value]="name()"
                (input)="name.set(text($event))"
              />
            </label>
            <app-milestone-editor [(groups)]="groups" [disabled]="writing()" />
            <ul
              class="m-0 list-none p-0 text-sm text-charcoal-brown-500"
              aria-label="Still missing"
            >
              @for (problem of problems(); track problem) {
                <li>{{ problem }}</li>
              }
            </ul>
            @if (failure(); as failure) {
              <p class="m-0 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
            }
            <div class="flex justify-end gap-2">
              <ui-action-button [action]="cancelAction()" />
              <ui-action-button [action]="createAction()" />
            </div>
          </form>
        }
        <div class="mb-4 flex gap-1 text-sm" role="group" aria-label="Met">
          @for (option of filters; track option.value) {
            <button
              type="button"
              class="h-7 cursor-pointer rounded-md border px-2 text-xs font-semibold"
              [class]="
                filter() === option.value
                  ? 'border-ocean-deep-600 bg-ocean-deep-50 text-ocean-deep-800'
                  : 'border-charcoal-brown-200 bg-white text-charcoal-brown-700'
              "
              [attr.aria-pressed]="filter() === option.value"
              (click)="filter.set(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        <ui-load-failure
          message="The milestones could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (milestone of shown(); track milestone.id) {
              <li
                class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-charcoal-brown-200 bg-white px-3 py-2 text-sm"
                data-milestone
              >
                <a
                  class="font-semibold text-ocean-deep-700 no-underline hover:underline"
                  [routerLink]="link(milestone.id)"
                  >{{ milestone.displayName }}</a
                >
                @if (milestone.satisfiedAt) {
                  <ui-chip [label]="'met since ' + date(milestone.satisfiedAt)" tone="ok" />
                } @else {
                  <ui-chip label="not met" tone="neutral" />
                }
                <span class="text-charcoal-brown-500">made {{ date(milestone.createdAt) }}</span>
                <span class="ml-auto text-charcoal-brown-700" data-needed-by>{{
                  neededBy(milestone)
                }}</span>
              </li>
            } @empty {
              <li class="text-sm text-charcoal-brown-500">{{ emptyText() }}</li>
            }
          </ul>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class WorkMilestonesPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(MilestonesStore);
  private readonly router = inject(Router);

  protected readonly filters: readonly { readonly value: MetFilter; readonly label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unmet', label: 'Not met' },
    { value: 'met', label: 'Met' },
  ];
  protected readonly filter = signal<MetFilter>('all');

  protected readonly creating = signal(false);
  protected readonly name = signal('');
  protected readonly groups = signal<readonly GroupDraft[]>([newGroup()]);
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  private readonly projectId = computed(() => this.selected.project()?.id ?? '');
  private readonly list = computed(() => this.store.listOf(this.projectId()));

  protected readonly state = computed((): LoadState => {
    const status = this.list()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  /** The milestones the filter lets through, oldest first. */
  protected readonly shown = computed(() => {
    const milestones = this.list()?.milestones ?? [];
    switch (this.filter()) {
      case 'met':
        return milestones.filter((m) => !!m.satisfiedAt);
      case 'unmet':
        return milestones.filter((m) => !m.satisfiedAt);
      default:
        return milestones;
    }
  });

  protected readonly emptyText = computed(() => {
    switch (this.filter()) {
      case 'met':
        return 'No milestone is met.';
      case 'unmet':
        return 'Every milestone is met.';
      default:
        return 'This project has no milestones yet.';
    }
  });

  protected readonly problems = computed(() => draftProblems(this.name(), this.groups()));

  protected readonly actions = computed((): readonly Action[] => [
    {
      label: 'New milestone',
      variant: 'success',
      disabled: this.creating(),
      callback: () => this.open(),
    },
  ]);

  protected readonly createAction = computed((): Action => ({
    label: this.writing() ? 'Creating…' : 'Create',
    variant: 'success',
    disabled: this.writing() || this.problems().length > 0,
    callback: () => void this.create(),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.creating.set(false),
  }));

  protected readonly date = utcMinute;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.projectId();
      if (id) untracked(() => void this.store.loadList(id));
    });
    this.store.follow(
      inject(DestroyRef),
      () => this.projectId() || undefined,
      () => {
        const id = this.projectId();
        if (id) void this.store.refreshList(id);
      },
    );
  }

  /** "2 items need it", "1 item and 1 membership need it", "Nothing needs it". */
  protected neededBy(milestone: MilestoneEntry): string {
    const items = milestone.entities?.length ?? 0;
    const memberships = milestone.memberships?.length ?? 0;
    const parts = [
      items ? `${items} ${items === 1 ? 'item' : 'items'}` : '',
      memberships ? `${memberships} ${memberships === 1 ? 'membership' : 'memberships'}` : '',
    ].filter(Boolean);
    if (!parts.length) return 'Nothing needs it';
    return `${parts.join(' and ')} ${items + memberships === 1 ? 'needs' : 'need'} it`;
  }

  protected link(id?: string): string {
    return milestonePath(this.selected.slug() ?? '', id);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected retry(): void {
    const id = this.projectId();
    if (id) void this.store.loadList(id);
  }

  private open(): void {
    this.failure.set(null);
    this.name.set('');
    this.groups.set([newGroup()]);
    this.creating.set(true);
  }

  private async create(): Promise<void> {
    const projectId = this.projectId();
    if (this.writing() || !projectId) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await this.store.create(projectId, this.name(), groupSpecs(this.groups()));
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.creating.set(false);
    void this.store.refreshList(projectId);
    if (outcome.value.id) await this.router.navigateByUrl(this.link(outcome.value.id));
  }
}
