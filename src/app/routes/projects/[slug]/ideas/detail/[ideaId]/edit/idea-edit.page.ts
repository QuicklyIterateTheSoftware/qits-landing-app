import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsEntityList, qitsMutation, qitsResource, stay } from '@qits/angular';
import { map } from 'rxjs';
import {
  ideaRefusal,
  ideaRunRefusal,
  patchIdeaParams,
  type IdeaPatch,
} from '$core/ideas/idea-writes';
import { EDIT_IDEA, IDEA, IDEA_LIST } from '$core/ideas/ideas.operations';
import { loadState } from '$core/resources/load-state';
import { valueMarks } from '$core/marks/value-marks';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { IdeaForm, type IdeaFormValue } from '$patterns/ideas/idea-form/idea-form';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The merge patch that turns `before` into `after`: only what changed, a blank description or
 * enabling idea as `null` (which clears it).
 */
export function ideaPatchOf(before: IdeaFormValue, after: IdeaFormValue): IdeaPatch {
  const blankToNull = (value: string) => (value.trim() ? value.trim() : null);
  return {
    ...(after.title.trim() !== before.title.trim() ? { title: after.title.trim() } : {}),
    ...(after.description.trim() !== before.description.trim()
      ? { description: blankToNull(after.description) }
      : {}),
    ...(after.enabledBy !== before.enabledBy ? { enabledBy: blankToNull(after.enabledBy) } : {}),
  };
}

/**
 * An idea's edit (epic qits-888), at `/projects/<slug>/ideas/detail/<idea id>/edit`: the idea
 * form (`app-idea-form`) filled with the idea (`IDEA`), offering the project's other
 * ideas that are not archived as the one enabling it. Save sends a JSON merge patch of what changed
 * (`EDIT_IDEA`; a cleared description or enabling idea as `null`), then goes back to the
 * idea's page, which reads it again; a refusal shows the service's 400 `message` under the form. Cancel goes
 * back without a write.
 *
 * Where it leads is declared (epic qits-2000), and the buttons carry the marks: Save reaches
 * `edit-idea` `saved` (the idea's page, after the write), `unchanged` (the idea's page, nothing to
 * send) or `refused` (the form kept, with the service's words); Cancel reaches `cancel-idea-edit`
 * `back` (the idea's page).
 *
 * It reads the idea and the project's ideas through `qitsResource`s over `IDEA` and `IDEA_LIST`, and
 * saves through `qitsMutation(EDIT_IDEA)` (qits-2146), in the browser only; the form's options are
 * the list read, marked as such (qits-2141).
 *
 * Staleness (qits-1270): reads the idea and the project's ideas once, as the form opens; it
 * follows no event, as a re-read would overwrite what is being typed.
 */
@Component({
  selector: 'app-idea-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdeaForm, PageLayoutComponent, QitsEntityList, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()" [titleMarks]="titleMarks()">
        <ui-spinner [state]="state()" class="min-h-48">
          <app-idea-form
            [qitsEntityList]="ideas"
            submitLabel="Save"
            [initial]="initial()"
            [options]="options()"
            [busy]="busy()"
            [refusal]="refusal()"
            [submitOutcomes]="[editing.saved, editing.unchanged, editing.refused]"
            [cancelOutcomes]="[cancelling.back]"
            (submitted)="save($event)"
            (cancelled)="back()"
          />
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class IdeaEditPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Save: the idea's page after the write, or with nothing to send; the form kept on a refusal. */
  protected readonly editing = outcomes('edit-idea', {
    saved: exit('projects/:slug/ideas/detail/:ideaId'),
    unchanged: exit('projects/:slug/ideas/detail/:ideaId'),
    refused: stay(),
  });
  /** Cancel: back to the idea, without a write. */
  protected readonly cancelling = outcomes('cancel-idea-edit', {
    back: exit('projects/:slug/ideas/detail/:ideaId'),
  });

  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('ideaId') ?? '')),
    { initialValue: '' },
  );

  /** The idea as it is now, which the form starts from; in the browser only. */
  private readonly read = qitsResource(IDEA, () => {
    const id = this.id();
    return this.browser && id ? { path: { id } } : undefined;
  });

  private readonly idea = computed(() => (this.read.hasValue() ? this.read.value() : undefined));

  protected readonly state = computed((): LoadState => loadState(this.read));

  protected readonly title = computed(() => `Edit ${this.idea()?.title ?? 'idea'}`);
  /** The title's data marks (qits-2146): the idea's title, once it is read. */
  protected readonly titleMarks = computed(() => {
    const idea = this.idea();
    return idea?.title != null ? valueMarks(IDEA, idea, 'id', { derived: ['title'] }) : undefined;
  });

  /** The form's starting value: the idea as read. */
  protected readonly initial = computed((): IdeaFormValue => {
    const idea = this.idea();
    return {
      title: idea?.title ?? '',
      description: idea?.description ?? '',
      enabledBy: idea?.enabledBy ?? '',
    };
  });

  private readonly projectId = computed(() => this.selected.project()?.id);

  /** The project's ideas, for the "Enabled by" choice; in the browser only. */
  protected readonly ideas = qitsResource(IDEA_LIST, () => {
    const project = this.projectId();
    return this.browser && project ? { query: { project } } : undefined;
  });

  private readonly editing$ = qitsMutation(EDIT_IDEA);

  protected readonly options = computed(() =>
    (this.ideas.hasValue() ? (this.ideas.value()?.ideas ?? []) : []).filter(
      (idea) => !idea.archived && idea.id !== this.id(),
    ),
  );

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** The idea's page's params. */
  private ideaParams() {
    return { slug: this.selected.slug() ?? '', ideaId: this.id() };
  }

  protected back(): void {
    void this.cancelling.back.go(this.ideaParams());
  }

  protected async save(value: IdeaFormValue): Promise<void> {
    if (this.busy()) return;
    const patch = ideaPatchOf(this.initial(), value);
    if (Object.keys(patch).length === 0) {
      void this.editing.unchanged.go(this.ideaParams());
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    const refusal = await this.editing$
      .run(patchIdeaParams(this.id(), patch))
      .then((idea) => (idea?.id ? null : ideaRefusal(undefined, 200)), ideaRunRefusal);
    this.busy.set(false);
    if (refusal !== null) {
      this.editing.refused.reach();
      this.refusal.set(refusal);
      return;
    }
    void this.editing.saved.go(this.ideaParams());
  }
}
