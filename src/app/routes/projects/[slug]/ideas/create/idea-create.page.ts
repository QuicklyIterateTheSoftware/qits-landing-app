import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { exit, outcomes, QitsEntityList, qitsMutation, qitsResource, stay } from '@qits/angular';
import { createIdeaParams, ideaRefusal, ideaRunRefusal } from '$core/ideas/idea-writes';
import { CREATE_IDEA, IDEA_LIST } from '$core/ideas/ideas.operations';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { IdeaForm, type IdeaFormValue } from '$patterns/ideas/idea-form/idea-form';

/**
 * A new idea for the open project (epic qits-888), at `/projects/<slug>/ideas/create`: the idea
 * form (`app-idea-form`, with its live paragraph and character counts), offering the project's
 * ideas that are not archived as the one enabling it. Create sends `CREATE_IDEA` and goes to
 * the new idea's page; a refusal shows the service's 400 `message` under the form. Cancel goes back
 * to the list.
 *
 * Where it leads is declared (epic qits-2000), and the buttons carry the marks: `create-idea`
 * `created` (the new idea's page) or `refused` (the form kept, with the service's words), and
 * `cancel-idea-create` `back` (the Ideas page).
 *
 * It reads the project's ideas through its own `qitsResource` over `IDEA_LIST` and creates through
 * `qitsMutation(CREATE_IDEA)` (qits-2146), in the browser only; the form's options are that read,
 * marked as its list (qits-2141).
 *
 * Staleness (qits-1270): reads the project's ideas once, for the "Enabled by" choice; it follows
 * no event (the form is short-lived, and the service refuses an enabling idea that went away).
 */
@Component({
  selector: 'app-idea-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdeaForm, PageLayoutComponent, QitsEntityList],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="New idea">
        <app-idea-form
          [qitsEntityList]="ideas"
          submitLabel="Create"
          [options]="options()"
          [busy]="busy()"
          [refusal]="refusal()"
          [submitOutcomes]="[creation.created, creation.refused]"
          [cancelOutcomes]="[cancelling.back]"
          (submitted)="create($event)"
          (cancelled)="back()"
        />
      </app-page-layout>
    </div>
  `,
})
export class IdeaCreatePage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Create: the new idea's page, or the form kept with the refusal. */
  protected readonly creation = outcomes('create-idea', {
    created: exit('projects/:slug/ideas/detail/:ideaId'),
    refused: stay(),
  });
  /** Cancel: back to the Ideas page. */
  protected readonly cancelling = outcomes('cancel-idea-create', {
    back: exit('projects/:slug/ideas'),
  });

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly projectId = computed(() => this.selected.project()?.id);

  /** The project's ideas, for the "Enabled by" choice; in the browser only. */
  protected readonly ideas = qitsResource(IDEA_LIST, () => {
    const project = this.projectId();
    return this.browser && project ? { query: { project } } : undefined;
  });

  private readonly creating = qitsMutation(CREATE_IDEA);

  protected readonly options = computed(() =>
    (this.ideas.hasValue() ? (this.ideas.value()?.ideas ?? []) : []).filter(
      (idea) => !idea.archived,
    ),
  );

  protected back(): void {
    void this.cancelling.back.go({ slug: this.selected.slug() ?? '' });
  }

  protected async create(value: IdeaFormValue): Promise<void> {
    const projectId = this.projectId();
    if (!projectId || this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    const outcome: { readonly id: string } | { readonly refusal: string } = await this.creating
      .run(createIdeaParams(projectId, value))
      .then(
        (idea) => (idea?.id ? { id: idea.id } : { refusal: ideaRefusal(undefined, 201) }),
        (error: unknown) => ({ refusal: ideaRunRefusal(error) }),
      );
    this.busy.set(false);
    if ('refusal' in outcome) {
      this.creation.refused.reach();
      this.refusal.set(outcome.refusal);
      return;
    }
    void this.creation.created.go({ slug: this.selected.slug() ?? '', ideaId: outcome.id });
  }
}
