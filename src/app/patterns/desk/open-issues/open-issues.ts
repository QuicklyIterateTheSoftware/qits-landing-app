import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { QitsCommitMessage } from '@qits/ui-components';
import { type WorkEntry } from '$core/work/work.consumes';
import { SelectedWork } from '$core/work/selected-work';
import { WorkDetailStore } from '$core/work/work-detail.store';
import { workRef, WorkStore } from '$core/work/work.store';

/** The issues a person still has to answer, oldest first: `entries` holds every work item. */
export function openIssues(entries: readonly WorkEntry[]): readonly WorkEntry[] {
  return entries.filter((entry) => entry.archetype === 'ISSUE' && entry.status === 'OPEN');
}

/**
 * The project's open issues (qits-1819): what its delivery desk could not resolve on its own, for a
 * person to answer. The same list as `qits work list --archetype ISSUE --status OPEN`, with the
 * same writes as `qits work comment create` and `qits work status`.
 *
 * Resolve writes the answer on the thread first, when there is one, and then moves the issue. The
 * desk hears of both. A move reaches the list by `EntityTransitioned`. No event marks a new issue
 * (`SelectedWork.followTransitions`), so the list is read again when the page opens. The list row has
 * no description: each issue's own read has it. The work ids of the project in a description are
 * drawn as work references with their briefs (`<qits-commit-message>`, qits-1898). An issue's id
 * opens its page through the declared exit `open-open-issue:issue`.
 */
@Component({
  selector: 'app-open-issues',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsCommitMessage, QitsExit],
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
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        @for (issue of issues(); track issue.id) {
          <li class="rounded-md border border-line bg-surface px-3 py-2">
            <div class="flex flex-wrap items-baseline gap-2">
              <a
                class="font-mono text-sm text-accent no-underline hover:underline"
                [qitsExit]="opening.issue"
                [exitParams]="{ slug: slug(), id: ref(issue) }"
                >{{ issue.qualifiedId }}</a
              >
              <span class="text-sm font-semibold text-fg">{{ issue.title }}</span>
            </div>
            <p class="mt-1 mb-2 text-sm text-fg-soft">
              <qits-commit-message [message]="descriptionOf(issue)" [project]="slug()" />
            </p>
            <textarea
              class="block w-full rounded-md border border-line-strong px-2 py-1.5 text-sm"
              rows="2"
              [attr.aria-label]="'Answer ' + issue.qualifiedId"
              [value]="draftOf(issue)"
              (input)="setDraft(issue, $event)"
            ></textarea>
            <div class="mt-2 flex items-center justify-end gap-2">
              <span class="mr-auto text-xs text-danger" role="alert">{{ refusalOf(issue) }}</span>
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
  private readonly work = inject(WorkStore);
  private readonly details = inject(WorkDetailStore);

  /** The project's id and slug. */
  readonly projectId = input.required<string>();
  readonly slug = input.required<string>();

  /** An issue's id opens its page (`open-open-issue`, epic qits-2000). */
  protected readonly opening = outcomes('open-open-issue', {
    issue: exit('projects/:slug/work/detail/:id'),
  });

  private readonly drafts = signal<Readonly<Record<string, string>>>({});
  private readonly refusals = signal<Readonly<Record<string, string>>>({});

  private readonly answer = computed(() => this.work.byProject()[this.projectId()]);
  protected readonly status = computed(() => this.answer()?.status);
  protected readonly issues = computed(() => openIssues(this.answer()?.entries ?? []));

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) inject(SelectedWork).followTransitions(inject(DestroyRef));
    effect(() => {
      const id = this.projectId();
      if (browser && id) {
        untracked(
          () => void (this.work.byProject()[id] ? this.work.refresh(id) : this.work.load(id)),
        );
      }
    });
    effect(() => {
      if (!browser) return;
      for (const issue of this.issues()) {
        const ref = workRef(issue);
        if (ref) untracked(() => void this.details.load(ref));
      }
    });
  }

  /** The issue's qualified id, for its page. */
  protected ref(issue: WorkEntry): string {
    return workRef(issue) ?? '';
  }

  protected descriptionOf(issue: WorkEntry): string {
    return this.details.of(workRef(issue) ?? '')?.entity?.description ?? '';
  }

  protected draftOf(issue: WorkEntry): string {
    return this.drafts()[issue.id ?? ''] ?? '';
  }

  protected setDraft(issue: WorkEntry, event: Event): void {
    this.setIn(this.drafts, issue, (event.target as HTMLTextAreaElement).value);
  }

  protected refusalOf(issue: WorkEntry): string {
    return this.refusals()[issue.id ?? ''] ?? this.work.refusals()[issue.id ?? ''] ?? '';
  }

  /** Writes the draft on the issue's thread. Answers whether the thread has it. */
  protected async comment(issue: WorkEntry): Promise<boolean> {
    const ref = workRef(issue);
    const text = this.draftOf(issue).trim();
    if (!ref || !text) return false;
    const { refusal } = await this.details.addComment(ref, text);
    this.setIn(this.refusals, issue, refusal ?? '');
    if (refusal) return false;
    this.setIn(this.drafts, issue, '');
    return true;
  }

  /** Writes the answer, when there is one, then moves the issue to RESOLVED. */
  protected async resolve(issue: WorkEntry): Promise<void> {
    if (this.draftOf(issue).trim() && !(await this.comment(issue))) return;
    await this.work.transition(this.projectId(), issue, 'RESOLVED');
  }

  private setIn(target: typeof this.drafts, issue: WorkEntry, value: string): void {
    target.update((all) => ({ ...all, [issue.id ?? '']: value }));
  }
}
