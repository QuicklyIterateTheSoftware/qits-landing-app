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
import { Router } from '@angular/router';
import { ideaPath, ideasPath } from '$core/ideas/idea-path';
import { IdeasStore } from '$core/ideas/ideas.store';
import { SelectedProject } from '$core/projects/selected-project';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { IdeaForm, type IdeaFormValue } from '$patterns/ideas/idea-form/idea-form';

/**
 * A new idea for the open project (epic qits-888), at `/projects/<slug>/ideas/create`: the idea
 * form (`app-idea-form`, with its live paragraph and character counts), offering the project's
 * ideas that are not archived as the one enabling it. Create sends `IdeasStore.create` and goes to
 * the new idea's page; a refusal shows the service's 400 `message` under the form. Cancel goes back
 * to the list.
 *
 * Staleness (qits-1270): reads the project's ideas once, for the "Enabled by" choice; it follows
 * no event (the form is short-lived, and the service refuses an enabling idea that went away).
 */
@Component({
  selector: 'app-idea-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IdeaForm, PageLayoutComponent],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="New idea">
        <app-idea-form
          submitLabel="Create"
          [options]="options()"
          [busy]="busy()"
          [refusal]="refusal()"
          (submitted)="create($event)"
          (cancelled)="back()"
        />
      </app-page-layout>
    </div>
  `,
})
export class IdeaCreatePage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(IdeasStore);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly projectId = computed(() => this.selected.project()?.id);

  protected readonly options = computed(() => {
    const id = this.projectId();
    return (id ? this.store.listOf(id)?.ideas : undefined)?.filter((idea) => !idea.archived) ?? [];
  });

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => {
      const id = this.projectId();
      if (id) untracked(() => void this.store.loadList(id));
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(ideasPath(this.selected.slug() ?? ''));
  }

  protected async create(value: IdeaFormValue): Promise<void> {
    const projectId = this.projectId();
    if (!projectId || this.busy()) return;
    this.busy.set(true);
    this.refusal.set(null);
    const outcome = await this.store.create(projectId, value);
    this.busy.set(false);
    if (!outcome.ok) {
      this.refusal.set(outcome.refusal);
      return;
    }
    void this.router.navigateByUrl(ideaPath(this.selected.slug() ?? '', outcome.idea.id ?? ''));
  }
}
