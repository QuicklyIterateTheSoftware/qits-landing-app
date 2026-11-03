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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  describeCriterion,
  draftOf,
  draftProblems,
  groupSpecs,
  type GroupDraft,
} from '$core/milestones/milestone-criteria';
import { milestonePath } from '$core/milestones/milestone-path';
import { MilestonesStore } from '$core/milestones/milestones.store';
import { utcMinute } from '$core/projects/release-requests';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { workItemPath } from '$core/workspaces/agent-attention';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';
import { Chip } from '$ui/components/chip/chip';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { MilestoneEditor } from '$patterns/milestones/milestone-editor/milestone-editor';

/** What the page is doing besides showing the milestone. */
type Mode = 'view' | 'rename' | 'edit';

/**
 * One milestone's page (epic qits-615), at `/projects/<slug>/work/milestones/<id>`
 * (`MilestonesStore.load`): whether it is met and since when, when it was made, and its condition:
 * groups, any one of which meets it, each with when it was made and since when it holds, and their
 * criteria, which must all hold, each in words (`describeCriterion`; a work item by its qualified
 * id and title when the project's work holds it) with when it was made, since when it holds, and
 * how: the event's summary, or who approved it and why. Then what needs it: the work items (linked)
 * and the campaign memberships.
 *
 * Approve on a criterion of kind APPROVAL that does not hold yet, with an optional note
 * (`MilestonesStore.approve`). It is a person's: this app runs on a person's session, and the
 * service answers anyone else (an agent's or a service's credential) 403, shown in its words.
 * Rename (`MilestonesStore.rename`) and Edit criteria (`app-milestone-editor`,
 * `MilestonesStore.setGroups`: the whole condition; a criterion kept as it was keeps its latch, a
 * changed one starts over) are the page's actions. A write's answer is the milestone as it stands,
 * which the page shows at once.
 *
 * Staleness (qits-1270): `MilestoneMet` or `MilestoneUnmet` whose `projectId` is the open project
 * → this milestone (`MilestonesStore.refresh`, through `MilestonesStore.follow`). A criterion
 * latching without the milestone coming to hold (one of several in a group) sends no event, and
 * shows on the next read.
 */
@Component({
  selector: 'app-milestone-page',
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
      <app-page-layout [title]="title()" [actions]="actions()">
        <p class="mt-0 mb-4 text-sm">
          <a class="text-ocean-deep-700 no-underline hover:underline" [routerLink]="listLink()"
            >All milestones</a
          >
        </p>
        @if (mode() === 'rename') {
          <form
            class="mb-6 flex flex-wrap items-end gap-2"
            aria-label="Rename the milestone"
            (submit)="$event.preventDefault()"
          >
            <label class="flex flex-col gap-1 text-sm text-charcoal-brown-800">
              Name
              <input
                class="h-8 w-80 max-w-full rounded-md border border-charcoal-brown-300 px-2 text-sm"
                [value]="name()"
                (input)="name.set(text($event))"
              />
            </label>
            <ui-action-button [action]="saveNameAction()" />
            <ui-action-button [action]="cancelAction()" />
          </form>
        }
        @if (failure(); as failure) {
          <p class="mt-0 mb-4 text-sm text-cinnabar-700" role="alert">{{ failure }}</p>
        }
        <ui-load-failure
          message="This milestone could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="retry()"
        />
        <ui-spinner [state]="state()" class="min-h-48" [class.hidden]="state() === 'error'">
          @if (milestone(); as milestone) {
            <div class="flex flex-col gap-6 text-sm text-charcoal-brown-800">
              <div class="flex flex-wrap items-center gap-2">
                @if (milestone.satisfiedAt) {
                  <ui-chip [label]="'met since ' + date(milestone.satisfiedAt)" tone="ok" />
                } @else {
                  <ui-chip label="not met" tone="neutral" />
                }
                <span class="text-charcoal-brown-500">made {{ date(milestone.createdAt) }}</span>
              </div>
              @if (mode() === 'edit') {
                <form
                  class="flex flex-col gap-3"
                  aria-label="Edit the criteria"
                  (submit)="$event.preventDefault()"
                >
                  <p class="m-0 text-charcoal-brown-600">
                    Met while any one group holds; a group holds while all its criteria do. A
                    criterion you change starts over.
                  </p>
                  <app-milestone-editor [(groups)]="groups" [disabled]="writing()" />
                  <ul class="m-0 list-none p-0 text-charcoal-brown-500" aria-label="Still missing">
                    @for (problem of problems(); track problem) {
                      <li>{{ problem }}</li>
                    }
                  </ul>
                  <div class="flex justify-end gap-2">
                    <ui-action-button [action]="cancelAction()" />
                    <ui-action-button [action]="saveGroupsAction()" />
                  </div>
                </form>
              } @else {
                <section class="flex flex-col gap-3" aria-label="Criteria">
                  <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Criteria</h2>
                  <p class="m-0 text-charcoal-brown-600">
                    Met while any one group holds; a group holds while all its criteria do.
                  </p>
                  @for (group of milestone.groups ?? []; track group.id; let g = $index) {
                    @if (g > 0) {
                      <p
                        class="m-0 text-xs font-semibold tracking-wide text-charcoal-brown-500 uppercase"
                      >
                        or
                      </p>
                    }
                    <div
                      class="flex flex-col gap-2 rounded-md border border-charcoal-brown-200 bg-white p-3"
                      data-group
                      role="group"
                      [attr.aria-label]="'Group ' + (g + 1)"
                    >
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-semibold">Group {{ g + 1 }}</span>
                        @if (group.satisfiedAt) {
                          <ui-chip [label]="'holds since ' + date(group.satisfiedAt)" tone="ok" />
                        } @else {
                          <ui-chip label="does not hold" tone="neutral" />
                        }
                        <span class="text-charcoal-brown-500"
                          >made {{ date(group.createdAt) }}</span
                        >
                      </div>
                      <ul class="m-0 flex list-none flex-col gap-2 p-0">
                        @for (criterion of group.criteria ?? []; track criterion.id) {
                          <li
                            class="flex flex-col gap-1 border-t border-charcoal-brown-100 pt-2"
                            data-criterion
                          >
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="font-medium">{{ describe(criterion) }}</span>
                              @if (criterion.satisfiedAt) {
                                <ui-chip
                                  [label]="'holds since ' + date(criterion.satisfiedAt)"
                                  tone="ok"
                                />
                              } @else {
                                <ui-chip label="does not hold" tone="neutral" />
                              }
                              <span class="text-charcoal-brown-500"
                                >made {{ date(criterion.createdAt) }}</span
                              >
                            </div>
                            @if (criterion.evidence?.summary; as summary) {
                              <p class="m-0 text-charcoal-brown-600" data-evidence>{{ summary }}</p>
                            }
                            @if (criterion.approval; as approval) {
                              <p class="m-0 text-charcoal-brown-600" data-approval>
                                Approved by {{ approval.approvedBy
                                }}{{ approval.note ? ': ' + approval.note : '' }}
                              </p>
                            }
                            @if (approvable(criterion)) {
                              @if (approving() === criterion.id) {
                                <div class="flex flex-wrap items-end gap-2">
                                  <label
                                    class="flex flex-col gap-1 text-xs text-charcoal-brown-600"
                                  >
                                    Note (optional)
                                    <input
                                      class="h-8 w-80 max-w-full rounded-md border border-charcoal-brown-300 px-2 text-sm"
                                      [value]="note()"
                                      (input)="note.set(text($event))"
                                    />
                                  </label>
                                  <ui-action-button
                                    [action]="confirmApproveAction(criterion.id ?? '')"
                                  />
                                  <ui-action-button [action]="cancelApproveAction()" />
                                </div>
                              } @else {
                                <div>
                                  <ui-action-button [action]="approveAction(criterion.id ?? '')" />
                                </div>
                              }
                            }
                          </li>
                        }
                      </ul>
                    </div>
                  }
                </section>
              }
              <section class="flex flex-col gap-1" aria-label="Needed by">
                <h2 class="m-0 text-base font-semibold text-charcoal-brown-900">Needed by</h2>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                  @for (work of milestone.entities ?? []; track work.id) {
                    <li class="flex flex-wrap items-baseline gap-2" data-needed-by-work>
                      <a
                        class="font-mono whitespace-nowrap text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="workLink(work.qualifiedId ?? '')"
                        >{{ work.qualifiedId }}</a
                      >
                      <span class="text-charcoal-brown-500"
                        >{{ (work.archetype ?? '').toLowerCase() }} ·
                        {{ (work.status ?? '').toLowerCase() }}</span
                      >
                      <span>{{ work.title }}</span>
                    </li>
                  }
                  @for (membership of milestone.memberships ?? []; track membership.membershipId) {
                    <li class="flex flex-wrap items-baseline gap-2" data-needed-by-membership>
                      <a
                        class="font-mono whitespace-nowrap text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="workLink(membership.entityQualifiedId ?? '')"
                        >{{ membership.entityQualifiedId }}</a
                      >
                      <span class="text-charcoal-brown-500">as a member of</span>
                      <a
                        class="text-ocean-deep-700 no-underline hover:underline"
                        [routerLink]="workLink(membership.campaignQualifiedId ?? '')"
                        >{{ membership.campaignTitle || membership.campaignQualifiedId }}</a
                      >
                    </li>
                  }
                  @if (
                    !(milestone.entities ?? []).length && !(milestone.memberships ?? []).length
                  ) {
                    <li class="text-charcoal-brown-500">Nothing needs it yet.</li>
                  }
                </ul>
              </section>
            </div>
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class MilestonePage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(MilestonesStore);
  private readonly work = inject(SelectedWork);

  /** The milestone id in the URL. */
  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('milestoneId') ?? '')),
    { initialValue: '' },
  );

  private readonly view = computed(() => this.store.of(this.id()));
  protected readonly milestone = computed(() => this.view()?.milestone);

  protected readonly state = computed((): LoadState => {
    const status = this.view()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected readonly title = computed(() => this.milestone()?.displayName ?? 'Milestone');

  protected readonly mode = signal<Mode>('view');
  protected readonly name = signal('');
  protected readonly groups = signal<readonly GroupDraft[]>([]);
  /** The criterion whose Approve is open; null while none is. */
  protected readonly approving = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly writing = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly problems = computed(() =>
    draftProblems(this.milestone()?.displayName ?? '', this.groups()),
  );

  protected readonly actions = computed((): readonly Action[] => {
    if (!this.milestone()) return [];
    const busy = this.writing() || this.mode() !== 'view';
    return [
      { label: 'Rename', variant: 'muted', disabled: busy, callback: () => this.openRename() },
      {
        label: 'Edit criteria',
        variant: 'muted',
        disabled: busy,
        callback: () => this.openEdit(),
      },
    ];
  });

  protected readonly saveNameAction = computed((): Action => ({
    label: this.writing() ? 'Saving…' : 'Save',
    variant: 'success',
    disabled: this.writing() || !this.name().trim(),
    callback: () => void this.write(() => this.store.rename(this.id(), this.name())),
  }));

  protected readonly saveGroupsAction = computed((): Action => ({
    label: this.writing() ? 'Saving…' : 'Save criteria',
    variant: 'success',
    disabled: this.writing() || this.problems().length > 0,
    callback: () =>
      void this.write(() => this.store.setGroups(this.id(), groupSpecs(this.groups()))),
  }));

  protected readonly cancelAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.mode.set('view'),
  }));

  protected readonly cancelApproveAction = computed((): Action => ({
    label: 'Cancel',
    variant: 'muted',
    disabled: this.writing(),
    callback: () => this.approving.set(null),
  }));

  protected readonly listLink = computed(() => milestonePath(this.selected.slug() ?? ''));

  protected readonly date = utcMinute;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.id();
      if (id) untracked(() => void this.store.load(id));
    });
    this.store.follow(
      inject(DestroyRef),
      () => this.selected.project()?.id,
      () => {
        const id = this.id();
        if (id) void this.store.refresh(id);
      },
    );
  }

  /** A criterion in words; a work item by its qualified id and title when the work holds it. */
  protected describe(criterion: { readonly kind?: string; readonly predicate?: unknown }): string {
    const entries = this.work.entries();
    return describeCriterion(criterion, (ref) => {
      const entry = entries.find((e) => e.id === ref || e.qualifiedId === ref);
      return entry ? `${entry.qualifiedId} (${entry.title ?? ''})` : undefined;
    });
  }

  /** An APPROVAL criterion that does not hold yet: a person may approve it. */
  protected approvable(criterion: {
    readonly kind?: string;
    readonly satisfiedAt?: string;
  }): boolean {
    return criterion.kind === 'APPROVAL' && !criterion.satisfiedAt;
  }

  protected approveAction(criterionId: string): Action {
    return {
      label: 'Approve',
      variant: 'success',
      disabled: this.writing() || this.approving() !== null,
      callback: () => {
        this.failure.set(null);
        this.note.set('');
        this.approving.set(criterionId);
      },
    };
  }

  protected confirmApproveAction(criterionId: string): Action {
    return {
      label: this.writing() ? 'Approving…' : 'Confirm approval',
      variant: 'success',
      disabled: this.writing(),
      callback: () =>
        void this.write(() => this.store.approve(this.id(), criterionId, this.note())),
    };
  }

  protected workLink(qualifiedId: string): string {
    return workItemPath(this.selected.slug() ?? '', qualifiedId);
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected retry(): void {
    const id = this.id();
    if (id) void this.store.load(id);
  }

  private openRename(): void {
    this.failure.set(null);
    this.name.set(this.milestone()?.displayName ?? '');
    this.mode.set('rename');
  }

  private openEdit(): void {
    this.failure.set(null);
    this.groups.set(draftOf(this.milestone()));
    this.mode.set('edit');
  }

  /** Sends a write; its answer is the milestone as it stands, which the store already holds. */
  private async write(
    send: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: string }>,
  ): Promise<void> {
    if (this.writing()) return;
    this.writing.set(true);
    this.failure.set(null);
    const outcome = await send();
    this.writing.set(false);
    if (!outcome.ok) {
      this.failure.set(outcome.refusal);
      return;
    }
    this.mode.set('view');
    this.approving.set(null);
  }
}
