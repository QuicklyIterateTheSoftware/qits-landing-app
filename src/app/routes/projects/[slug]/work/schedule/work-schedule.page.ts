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
import { exit, outcomes, QitsExit, sourceMark } from '@qits/angular';
import { SelectedProject } from '$core/projects/selected-project';
import { SelectedWork } from '$core/work/selected-work';
import { WorkCriteriaReads, type WorkCriteria } from '$core/work/work-criteria';
import type { WorkEntry } from '$core/work/work.consumes';
import { WORK_MARKS } from '$core/work/work-marks';
import { WorkMoves } from '$core/work/work-moves';
import { WORK_CRITERIA } from '$core/work/work-detail.operations';
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
 * its epic), each with its acceptance criteria (`WorkCriteriaReads`, one `getWork` read per item:
 * the project's work list does not carry them):
 *
 * - **To schedule**: every REFINED epic and ticket. The person ticks several and confirms
 *   "Schedule": each moves to READY_FOR_DEV through qits-projects' status door with the viewer's
 *   own session, which is the person's approval the service asks for. An epic takes its features
 *   and tasks along (the service's cascade).
 * - **Scheduled, not started**: every READY_FOR_DEV epic and ticket. "Unschedule" moves one back to
 *   REFINED.
 *
 * Each item's title opens its page (the declared exit `open-scheduled-item` `open`, epic
 * qits-2000); its work reference does too (`app-work-ref`'s own).
 *
 * A move the service refuses (a 409: no acceptance criteria, or a caller it does not take for a
 * person) shows its message under the item, verbatim, until the item's next move. The lists follow
 * every `EntityTransitioned`, as every work page does (`WorkLayout`).
 */
@Component({
  selector: 'app-work-schedule-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Markdown, NgTemplateOutlet, PageLayoutComponent, QitsExit, Spinner, WorkRef],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-6 pb-12">
      <app-page-layout title="Schedule">
        <ui-spinner [state]="work.state()" class="min-h-48">
          <div class="flex flex-col gap-10">
            <section class="flex flex-col gap-3" aria-labelledby="schedule-to-schedule">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 id="schedule-to-schedule" class="m-0 text-lg font-semibold text-fg">
                  To schedule
                </h2>
                <button
                  type="button"
                  class="rounded-md border border-success bg-success px-3 py-1.5 text-sm text-fg-on-accent hover:bg-success/90 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-muted disabled:text-fg-muted"
                  [disabled]="!chosen().length"
                  (click)="schedule()"
                >
                  {{ chosen().length ? 'Schedule ' + chosen().length : 'Schedule' }}
                </button>
              </div>
              <p class="m-0 text-sm text-fg-soft">
                Refined epics and tickets. Scheduling marks them ready for dev, so an agent may
                start them; an epic takes its features and tasks along.
              </p>
              <ul
                class="m-0 list-none flex-col gap-2 p-0"
                [class]="toSchedule().length ? 'flex' : 'hidden'"
                [attr.data-qits-source]="marks.source"
              >
                @for (row of toSchedule(); track row.id) {
                  <li
                    class="flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm"
                    [attr.data-qits-source]="marks.source"
                    [attr.data-qits-item]="marks.item(row.entry)"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5 size-4 shrink-0 accent-success"
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
              <p class="m-0 text-sm text-fg-muted" [class.hidden]="toSchedule().length">
                Nothing to schedule.
              </p>
            </section>

            <section class="flex flex-col gap-3" aria-labelledby="schedule-scheduled">
              <h2 id="schedule-scheduled" class="m-0 text-lg font-semibold text-fg">
                Scheduled, not started
              </h2>
              <p class="m-0 text-sm text-fg-soft">
                Ready for dev and not started yet. Unscheduling takes one back to refined.
              </p>
              <ul
                class="m-0 list-none flex-col gap-2 p-0"
                [class]="scheduled().length ? 'flex' : 'hidden'"
                [attr.data-qits-source]="marks.source"
              >
                @for (row of scheduled(); track row.id) {
                  <li
                    class="flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm"
                    [attr.data-qits-source]="marks.source"
                    [attr.data-qits-item]="marks.item(row.entry)"
                  >
                    <ng-container
                      *ngTemplateOutlet="item; context: { $implicit: row }"
                    ></ng-container>
                    <button
                      type="button"
                      class="shrink-0 rounded-md border border-line-strong bg-surface px-3 py-1 text-sm text-fg-soft hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:text-fg-faint"
                      [disabled]="row.moving"
                      [attr.aria-label]="'Unschedule ' + row.qualifiedId"
                      (click)="unschedule(row.entry)"
                    >
                      Unschedule
                    </button>
                  </li>
                }
              </ul>
              <p class="m-0 text-sm text-fg-muted" [class.hidden]="scheduled().length">
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
            class="font-medium text-fg no-underline wrap-anywhere hover:underline"
            data-qits-field="title"
            [qitsExit]="opening.open"
            [exitParams]="{ slug: slug() ?? '', id: row.qualifiedId }"
            >{{ row.entry.title }}</a
          >
        </div>
        <div class="flex flex-col gap-1">
          <p class="m-0 text-xs font-semibold tracking-wide text-fg-soft uppercase">
            Acceptance criteria
          </p>
          @switch (row.criteria?.status) {
            @case ('loaded') {
              @if (row.criteria.items.length) {
                <ul
                  class="m-0 list-disc pl-5 text-fg"
                  [attr.data-qits-source]="marks.criteria"
                  [attr.data-qits-item]="marks.item(row.entry)"
                  data-qits-field="acceptanceCriteria"
                >
                  @for (criterion of row.criteria.items; track $index) {
                    <li><ui-markdown [text]="criterion" [workProject]="slug()" /></li>
                  }
                </ul>
              } @else {
                <p class="m-0 text-fg-soft">None yet: scheduling is refused until it has some.</p>
              }
            }
            @case ('error') {
              <p class="m-0 text-fg-soft">They could not be read.</p>
            }
            @default {
              <p class="m-0 text-fg-muted">Reading…</p>
            }
          }
        </div>
        <p
          role="alert"
          class="m-0 rounded-md bg-danger-soft px-2 py-1 text-danger-strong wrap-anywhere"
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
  private readonly moves = inject(WorkMoves);
  private readonly criteria = inject(WorkCriteriaReads);

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

  /** The project's slug: the work ids a criterion names link with their briefs (qits-1898). */
  protected readonly slug = this.selected.slug;

  /**
   * The data marks (qits-2141), as plain attributes: each row is a work item of the project's work
   * (`work-marks.ts`: `SelectedWork`'s read, which the rule cannot trace), its criteria the same
   * item read by `WORK_CRITERIA`.
   */
  protected readonly marks = { ...WORK_MARKS, criteria: sourceMark(WORK_CRITERIA) };

  protected readonly opening = outcomes('open-scheduled-item', {
    open: exit('projects/:slug/work/detail/:id'),
  });

  constructor() {
    // The open project's work is read once a page wants it (`SelectedWork`, qits-2146).
    this.work.want();
    // In the browser only, as the work: the server render holds no token to send.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const { toSchedule, scheduled } = this.lists();
        const refs = [...toSchedule, ...scheduled].flatMap((e) =>
          e.qualifiedId ? [e.qualifiedId] : [],
        );
        untracked(() => {
          for (const ref of refs) this.criteria.read(ref);
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
    await this.moves.transitionAll(projectId, entries, SCHEDULED);
    const refusals = this.moves.refusals();
    this.picked.update((picked) => new Set([...picked].filter((id) => refusals[id])));
  }

  /** Moves `entry` back to REFINED. */
  protected unschedule(entry: WorkEntry): void {
    const projectId = this.selected.project()?.id;
    if (projectId) void this.moves.transition(projectId, entry, REFINED);
  }

  private rows(entries: readonly WorkEntry[]): readonly ScheduleRow[] {
    const moving = this.moves.transitioning();
    const refusals = this.moves.refusals();
    return entries.flatMap((entry) => {
      const { id, qualifiedId } = entry;
      if (!id || !qualifiedId) return [];
      return [
        {
          entry,
          id,
          qualifiedId,
          criteria: this.criteria.of(qualifiedId),
          refusal: refusals[id] ?? '',
          moving: moving[id] === 'running',
        },
      ];
    });
  }
}
