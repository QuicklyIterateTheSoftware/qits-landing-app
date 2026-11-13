import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  exit,
  outcomes,
  QitsApiError,
  QitsEntity,
  QitsEntityList,
  QitsExit,
  QitsField,
  qitsMutation,
  qitsResource,
} from '@qits/angular';
import { payloadIds } from '$core/events/refresh-on';
import { WORK_EVENTS, WORK_REFRESH_DEBOUNCE_MS } from '$core/work/selected-work';
import { commentRefusal } from '$core/work/work-detail.store';
import { ADD_WORK_COMMENT, MOVE_WORK, OPEN_ISSUES } from '$core/work/work.operations';
import { type WorkEntry } from '$core/work/work.consumes';
import { refusalOf, workRef } from '$core/work/work.store';
import { IssueDescription } from '$patterns/desk/issue-description/issue-description';

/** An entry of the project's work, as the open issues read it (`OPEN_ISSUES`). */
type IssueEntry = Pick<WorkEntry, 'id' | 'qualifiedId' | 'title' | 'archetype' | 'status'>;

/** The issues a person still has to answer, oldest first: `entries` holds every work item. */
export function openIssues<T extends Pick<WorkEntry, 'archetype' | 'status'>>(
  entries: readonly T[],
): readonly T[] {
  return entries.filter((entry) => entry.archetype === 'ISSUE' && entry.status === 'OPEN');
}

/**
 * The project's open issues (qits-1819): what its delivery desk could not resolve on its own, for a
 * person to answer. The same list as `qits work list --archetype ISSUE --status OPEN`, with the
 * same writes as `qits work comment create` and `qits work status`.
 *
 * Resolve writes the answer on the thread first, when there is one, and then moves the issue. The
 * desk hears of both. The list row has no description: each issue's own read has it
 * (`app-issue-description`). An issue's id opens its page through the declared exit
 * `open-open-issue:issue`.
 *
 * It reads the project's work through its own `qitsResource` over `OPEN_ISSUES`, and writes through
 * `qitsMutation`s (`ADD_WORK_COMMENT`, `MOVE_WORK`; qits-2146), in the browser only. Marks
 * (qits-2141): the list is that read, each row an issue by its id, its qualified id and title.
 *
 * Staleness (qits-1270): `EntityTransitioned` naming the project among its `entities[].projectId`
 * → the project's work (the resource's `refreshOn`, at most once a second, as
 * `SelectedWork.followTransitions` was); a Resolve that went through reads it again at once. No
 * event marks a new issue, so the list is read again when the page opens.
 */
@Component({
  selector: 'app-open-issues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IssueDescription, QitsEntity, QitsEntityList, QitsExit, QitsField],
  host: { class: 'block' },
  template: `
    <section class="mb-6" aria-label="Open issues">
      <h2 class="mt-0 mb-2 text-base font-semibold text-fg">Open issues</h2>
      <p
        class="m-0 text-sm text-fg-muted"
        [class.hidden]="status() !== 'loaded' || issues().length > 0"
      >
        Nothing waits on a person.
      </p>
      <p class="m-0 text-sm text-danger" [class.hidden]="status() !== 'error'">
        This project’s issues could not be read.
      </p>
      <ul class="m-0 flex list-none flex-col gap-2 p-0" [qitsEntityList]="work">
        @for (issue of issues(); track issue.id) {
          <li
            class="rounded-md border border-line bg-surface px-3 py-2"
            [qitsEntity]="issue"
            entityKey="id"
          >
            <div class="flex flex-wrap items-baseline gap-2">
              <a
                class="font-mono text-sm text-accent no-underline hover:underline"
                [qitsExit]="opening.issue"
                [exitParams]="{ slug: slug(), id: ref(issue) }"
                [fieldOf]="issue"
                qitsField="qualifiedId"
                >{{ issue.qualifiedId }}</a
              >
              <span class="text-sm font-semibold text-fg" [fieldOf]="issue" qitsField="title">{{
                issue.title
              }}</span>
            </div>
            <p class="mt-1 mb-2 text-sm text-fg-soft">
              <app-issue-description [qualifiedId]="ref(issue)" [slug]="slug()" />
            </p>
            <textarea
              class="block w-full rounded-md border border-line-strong px-2 py-1.5 text-sm"
              rows="2"
              [attr.aria-label]="'Answer ' + issue.qualifiedId"
              [value]="draftOf(issue)"
              (input)="setDraft(issue, $event)"
            ></textarea>
            <div class="mt-2 flex items-center justify-end gap-2">
              <!-- The refusal of this issue's last write, kept by its id. -->
              <span
                class="mr-auto text-xs text-danger"
                role="alert"
                [fieldOf]="issue"
                [qitsField]="{ derived: ['id'] }"
                >{{ refusalOf(issue) }}</span
              >
              <button
                type="button"
                class="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm disabled:opacity-50"
                [disabled]="!draftOf(issue).trim()"
                (click)="comment(issue)"
              >
                Comment
              </button>
              <button
                type="button"
                class="rounded-md border border-accent bg-accent px-2 py-1 text-sm text-fg-on-accent"
                (click)="resolve(issue)"
              >
                Resolve
              </button>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class OpenIssues {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The project's id and slug. */
  readonly projectId = input.required<string>();
  readonly slug = input.required<string>();

  /** An issue's id opens its page (`open-open-issue`, epic qits-2000). */
  protected readonly opening = outcomes('open-open-issue', {
    issue: exit('projects/:slug/work/detail/:id'),
  });

  /** The project's work, in the browser only; read again when a move names the project. */
  protected readonly work = qitsResource(
    OPEN_ISSUES,
    () => {
      const project = this.projectId();
      return this.browser && project ? { path: { project } } : undefined;
    },
    {
      refreshOn: {
        names: WORK_EVENTS,
        debounceMs: WORK_REFRESH_DEBOUNCE_MS,
        // `projectIds` holds `entities[].projectId`.
        when: (event) => payloadIds(event).projectIds.includes(this.projectId()),
      },
    },
  );

  private readonly commenting = qitsMutation(ADD_WORK_COMMENT);
  private readonly moving = qitsMutation(MOVE_WORK, { affects: () => [this.work] });

  private readonly drafts = signal<Readonly<Record<string, string>>>({});
  private readonly refusals = signal<Readonly<Record<string, string>>>({});

  protected readonly status = computed(() => {
    const status = this.work.status();
    if (status === 'error') return 'error';
    return this.work.hasValue() ? 'loaded' : undefined;
  });
  protected readonly issues = computed(() =>
    openIssues(this.work.hasValue() ? (this.work.value()?.entities ?? []) : []),
  );

  /** The issue's qualified id, for its page and its own read. */
  protected ref(issue: IssueEntry): string {
    return workRef(issue) ?? '';
  }

  protected draftOf(issue: IssueEntry): string {
    return this.drafts()[issue.id ?? ''] ?? '';
  }

  protected setDraft(issue: IssueEntry, event: Event): void {
    this.setIn(this.drafts, issue, (event.target as HTMLTextAreaElement).value);
  }

  protected refusalOf(issue: IssueEntry): string {
    return this.refusals()[issue.id ?? ''] ?? '';
  }

  /** Writes the draft on the issue's thread. Answers whether the thread has it. */
  protected async comment(issue: IssueEntry): Promise<boolean> {
    const ref = workRef(issue);
    const text = this.draftOf(issue).trim();
    if (!ref || !text) return false;
    const refusal = await this.commenting
      .run({ path: { qualifiedId: ref }, body: { body: text } })
      .then(
        (answer) => (answer?.comment ? null : commentRefusal(undefined, 200)),
        (error: unknown) =>
          error instanceof QitsApiError
            ? commentRefusal(error.error, error.status)
            : commentRefusal(undefined, undefined),
      );
    this.setIn(this.refusals, issue, refusal ?? '');
    if (refusal) return false;
    this.setIn(this.drafts, issue, '');
    return true;
  }

  /** Writes the answer, when there is one, then moves the issue to RESOLVED. */
  protected async resolve(issue: IssueEntry): Promise<void> {
    if (this.draftOf(issue).trim() && !(await this.comment(issue))) return;
    const ref = workRef(issue);
    if (!ref) return;
    const refusal = await this.moving
      .run({ path: { qualifiedId: ref }, body: { target: 'RESOLVED' } })
      .then(
        (moved) => (moved?.status ? null : refusalOf(undefined, 200)),
        (error: unknown) =>
          error instanceof QitsApiError
            ? refusalOf(error.error, error.status)
            : refusalOf(undefined, undefined),
      );
    this.setIn(this.refusals, issue, refusal ?? '');
  }

  private setIn(target: typeof this.drafts, issue: IssueEntry, value: string): void {
    target.update((all) => ({ ...all, [issue.id ?? '']: value }));
  }
}
