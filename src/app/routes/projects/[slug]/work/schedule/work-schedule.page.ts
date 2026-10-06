import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { WorkDetailStore, type WorkCriteria } from '$core/work/work-detail.store';
import type { WorkEntry } from '$core/work/work.consumes';
import { WorkStore } from '$core/work/work.store';
import { Markdown } from '$ui/components/markdown/markdown';
import { Spinner } from '$ui/components/spinner/spinner';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { WorkRef } from '$patterns/work/work-ref/work-ref';

/** One listed item, with what the page shows beside it. */
interface ScheduleRow {
  readonly entry: WorkEntry;
  readonly id: string;
  readonly qualifiedId: string;
  /** Its acceptance criteria; undefined until their read starts. */
  readonly criteria: WorkCriteria | undefined;
  /** Why its last move failed (the service's 409, verbatim); empty when it did not. */
  readonly refusal: string;
  /** A move of it is on its way. */
  readonly moving: boolean;
}

/** The status a person schedules work into, and the one unscheduling takes it back to. */
const SCHEDULED = 'READY_FOR_DEV';
const REFINED = 'REFINED';

/**
 * The Schedule tab, at `/projects/<slug>/work/schedule`: where a person decides which refined work
 * an agent may start (qits-887). Two lists, epics and tickets only (a feature or a task moves with
 * its epic), each with its acceptance criteria (`WorkDetailStore.loadCriteria`, one read per item:
 * the project's work list does not carry them):
 *
 * - **To schedule**: every REFINED epic and ticket. The person ticks several and confirms
 *   "Schedule": each moves to READY_FOR_DEV through qits-projects' status door with the viewer's
 *   own session, which is the person's approval the service asks for. An epic takes its features
 *   and tasks along (the service's cascade).
 * - **Scheduled, not started**: every READY_FOR_DEV epic and ticket. "Unschedule" moves one back to
 *   REFINED.
 *
 * A move the service refuses (a 409: no acceptance criteria, or a caller it does not take for a
 * person) shows its message under the item, verbatim, until the item's next move. The lists follow
 * every `EntityTransitioned`, as every work page does (`WorkLayout`).
 */
@Component({
  selector: 'app-work-schedule-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, NgTemplateOutlet, PageLayoutComponent, RouterLink, Spinner, WorkRef],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Schedule">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <div class="flex flex-col gap-10">
            <section class="flex flex-col gap-3" aria-labelledby="schedule-to-schedule">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="schedule-to-schedule"
                  class="m-0 text-lg font-semibold text-charcoal-brown-900"
                >
                  To schedule
                </h2>
                <button
                  type="button"
                  class="rounded-md border border-mint-leaf-700 bg-mint-leaf-700 px-3 py-1.5 text-sm text-white hover:border-mint-leaf-800 hover:bg-mint-leaf-800 disabled:cursor-not-allowed disabled:border-charcoal-brown-200 disabled:bg-charcoal-brown-100 disabled:text-charcoal-brown-500"
                  [disabled]="!chosen().length"
                  (click)="schedule()"
                >
                  {{ chosen().length ? 'Schedule ' + chosen().length : 'Schedule' }}
                </button>
              </div>
              <p class="m-0 text-sm text-charcoal-brown-600">
                Refined epics and tickets. Scheduling marks them ready for dev, so an agent may
                start them; an epic takes its features and tasks along.
              </p>
              <ul
                class="m-0 list-none flex-col gap-2 p-0"
                [class]="toSchedule().length ? 'flex' : 'hidden'"
              >
                @for (row of toSchedule(); track row.id) {
                  <li
                    class="flex items-start gap-3 rounded-md border border-charcoal-brown-200 bg-white p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5 size-4 shrink-0 accent-mint-leaf-700"
                      [checked]="picked().has(row.id)"
                      [disabled]="row.moving"
                      [attr.aria-label]="'Select ' + row.qualifiedId"
                      (change)="toggle(row.id)"
                    />
                    <ng-container
                      *ngTemplateOutlet="item; context: { $implicit: row }"
                    ></ng-container>
                  </li>
                }
              </ul>
              <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="toSchedule().length">
                Nothing to schedule.
              </p>
            </section>

            <section class="flex flex-col gap-3" aria-labelledby="schedule-scheduled">
              <h2 id="schedule-scheduled" class="m-0 text-lg font-semibold text-charcoal-brown-900">
                Scheduled, not started
              </h2>
              <p class="m-0 text-sm text-charcoal-brown-600">
                Ready for dev and not started yet. Unscheduling takes one back to refined.
              </p>
              <ul
                class="m-0 list-none flex-col gap-2 p-0"
                [class]="scheduled().length ? 'flex' : 'hidden'"
              >
                @for (row of scheduled(); track row.id) {
                  <li
                    class="flex items-start gap-3 rounded-md border border-charcoal-brown-200 bg-white p-3 text-sm"
                  >
                    <ng-container
                      *ngTemplateOutlet="item; context: { $implicit: row }"
                    ></ng-container>
                    <button
                      type="button"
                      class="shrink-0 rounded-md border border-charcoal-brown-300 bg-white px-3 py-1 text-sm text-charcoal-brown-800 hover:bg-charcoal-brown-100 hover:text-charcoal-brown-950 disabled:cursor-not-allowed disabled:text-charcoal-brown-400"
                      [disabled]="row.moving"
                      [attr.aria-label]="'Unschedule ' + row.qualifiedId"
                      (click)="unschedule(row.entry)"
                    >
                      Unschedule
                    </button>
                  </li>
                }
              </ul>
              <p class="m-0 text-sm text-charcoal-brown-500" [class.hidden]="scheduled().length">
                Nothing scheduled.
              </p>
            </section>
          </div>
        </ui-spinner>
      </app-page-layout>
    </div>

    <ng-template #item let-row>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <app-work-ref [qualifiedId]="row.qualifiedId" />
          <a
            class="font-medium text-charcoal-brown-900 no-underline wrap-anywhere hover:underline"
            [routerLink]="detailPath() + '/' + row.qualifiedId"
            >{{ row.entry.title }}</a
          >
        </div>
        <div class="flex flex-col gap-1">
          <p class="m-0 text-xs font-semibold tracking-wide text-charcoal-brown-600 uppercase">
            Acceptance criteria
          </p>
          @switch (row.criteria?.status) {
            @case ('loaded') {
              @if (row.criteria.items.length) {
                <ul class="m-0 list-disc pl-5 text-charcoal-brown-800">
                  @for (criterion of row.criteria.items; track $index) {
                    <li><ui-markdown [text]="criterion" /></li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-charcoal-brown-600">
                  None yet: scheduling is refused until it has some.
                </p>
              }
            }
            @case ('error') {
              <p class="m-0 text-charcoal-brown-600">They could not be read.</p>
            }
            @default {
              <p class="m-0 text-charcoal-brown-500">Reading…</p>
            }
          }
        </div>
        <p
          role="alert"
          class="m-0 rounded-md bg-cinnabar-50 px-2 py-1 text-cinnabar-800 wrap-anywhere"
          [class.hidden]="!row.refusal"
        >
          {{ row.refusal }}
        </p>
      </div>
    </ng-template>
  `,
})
export class WorkSchedulePage {
  protected readonly work = inject(SelectedWork);
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(WorkStore);
  private readonly details = inject(WorkDetailStore);

  private readonly lists = computed(() => this.work.graph().scheduling());

  /** The ids the person ticked in "To schedule". */
  protected readonly picked = signal<ReadonlySet<string>>(new Set());

  protected readonly toSchedule = computed(() => this.rows(this.lists().toSchedule));
  protected readonly scheduled = computed(() => this.rows(this.lists().scheduled));

  /** The ticked items that are still to schedule and not moving: what "Schedule" sends. */
  protected readonly chosen = computed(() =>
    this.toSchedule()
      .filter((row) => this.picked().has(row.id) && !row.moving)
      .map((row) => row.entry),
  );

  protected readonly detailPath = computed(
    () => `/projects/${this.selected.slug() ?? ''}/work/detail`,
  );

  constructor() {
    // In the browser only, as the work: the server render has no session cookie to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const { toSchedule, scheduled } = this.lists();
        const refs = [...toSchedule, ...scheduled].flatMap((e) =>
          e.qualifiedId ? [e.qualifiedId] : [],
        );
        untracked(() => {
          for (const ref of refs) void this.details.loadCriteria(ref);
        });
      });
    }
  }

  protected toggle(id: string): void {
    this.picked.update((picked) => {
      const next = new Set(picked);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Moves every ticked item to READY_FOR_DEV; a refused one stays ticked, with its reason. */
  protected async schedule(): Promise<void> {
    const projectId = this.selected.project()?.id;
    const entries = this.chosen();
    if (!projectId || !entries.length) return;
    await this.store.transitionAll(projectId, entries, SCHEDULED);
    const refusals = this.store.refusals();
    this.picked.update((picked) => new Set([...picked].filter((id) => refusals[id])));
  }

  /** Moves `entry` back to REFINED. */
  protected unschedule(entry: WorkEntry): void {
    const projectId = this.selected.project()?.id;
    if (projectId) void this.store.transition(projectId, entry, REFINED);
  }

  private rows(entries: readonly WorkEntry[]): readonly ScheduleRow[] {
    const moving = this.store.transitioning();
    const refusals = this.store.refusals();
    const criteria = this.details.criteria();
    return entries.flatMap((entry) => {
      const { id, qualifiedId } = entry;
      if (!id || !qualifiedId) return [];
      return [
        {
          entry,
          id,
          qualifiedId,
          criteria: criteria[qualifiedId],
          refusal: refusals[id] ?? '',
          moving: moving[id] === 'running',
        },
      ];
    });
  }
}
