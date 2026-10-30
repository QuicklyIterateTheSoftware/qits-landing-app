import { isPlatformBrowser } from '@angular/common';
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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ideaPath } from '$core/ideas/idea-path';
import { IdeasStore, type IdeaPatch } from '$core/ideas/ideas.store';
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
 * form (`app-idea-form`) filled with the idea (`IdeasStore.loadIdea`), offering the project's other
 * ideas that are not archived as the one enabling it. Save sends a JSON merge patch of what changed
 * (`IdeasStore.update`; a cleared description or enabling idea as `null`), then goes back to the
 * idea's page, read again; a refusal shows the service's 400 `message` under the form. Cancel goes
 * back without a write.
 *
 * Staleness (qits-1270): reads the idea and the project's ideas once, as the form opens; it
 * follows no event, as a re-read would overwrite what is being typed.
 */
@Component({
  selector: 'app-idea-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdeaForm, PageLayoutComponent, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="title()">
        <ui-spinner [state]="state()" class="min-h-48">
          <app-idea-form
            submitLabel="Save"
            [initial]="initial()"
            [options]="options()"
            [busy]="busy()"
            [refusal]="refusal()"
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
  private readonly store = inject(IdeasStore);
  private readonly router = inject(Router);

  protected readonly id = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('ideaId') ?? '')),
    { initialValue: '' },
  );

  private readonly view = computed(() => this.store.ideaOf(this.id()));

  protected readonly state = computed((): LoadState => {
    const status = this.view()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  protected readonly title = computed(() => `Edit ${this.view()?.idea?.title ?? 'idea'}`);

  /** The form's starting value: the idea as read. */
  protected readonly initial = computed((): IdeaFormValue => {
    const idea = this.view()?.idea;
    return {
      title: idea?.title ?? '',
      description: idea?.description ?? '',
      enabledBy: idea?.enabledBy ?? '',
    };
  });

  private readonly projectId = computed(() => this.selected.project()?.id);

  protected readonly options = computed(() => {
    const id = this.projectId();
    const list = id ? this.store.listOf(id)?.ideas : undefined;
    return (list ?? []).filter((idea) => !idea.archived && idea.id !== this.id());
  });

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.id();
      // Read afresh: the form starts from the idea as it is now.
      if (id)
        untracked(
          () => void (this.store.ideaOf(id) ? this.store.refreshIdea(id) : this.store.loadIdea(id)),
        );
    });
    effect(() => {
      const id = this.projectId();
      if (id) untracked(() => void this.store.loadList(id));
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(ideaPath(this.selected.slug() ?? '', this.id()));
  }

  protected async save(value: IdeaFormValue): Promise<void> {
    if (this.busy()) return;
    const patch = ideaPatchOf(this.initial(), value);
    if (Object.keys(patch).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    const outcome = await this.store.update(this.id(), patch);
    this.busy.set(false);
    if (!outcome.ok) {
      this.refusal.set(outcome.refusal);
      return;
    }
    void this.store.refreshIdea(this.id());
    this.back();
  }
}
