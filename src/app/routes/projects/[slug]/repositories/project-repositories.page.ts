import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoriesStore } from '$core/repositories/repositories.store';
import { repositoryTree } from '$core/repositories/repository-tree';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';
import { TreeFolder } from '$ui/components/tree-folder/tree-folder';
import { RepositoryCard } from '$patterns/repositories/repository-card/repository-card';

/**
 * A project's repositories, at `/projects/<slug>/repositories`, laid out like the wrapper's
 * checkout: the wrapper repository on top, then its directories (`components/<component>/…`) with
 * a card per repository, and a repository the wrapper does not mount under "Not in the wrapper".
 * The tree is `repositoryTree` in `core/repositories`; this page only draws it.
 */
@Component({
  selector: 'app-project-repositories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Spinner, TreeFolder, RepositoryCard],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <h1 class="m-0 text-3xl leading-[1.1] font-bold">Repositories</h1>

      <ui-spinner [state]="state()" class="mt-6 min-h-48">
        <div class="flex flex-col gap-6">
          <section aria-label="Wrapper" [class]="tree().wrapper ? 'block' : 'hidden'">
            @if (tree().wrapper; as wrapper) {
              <app-repository-card class="max-w-[24rem]" [entry]="wrapper" />
            }
          </section>

          <ng-template #branch let-nodes let-level="level">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6 py-2">
              @for (node of nodes; track $index) {
                @if (node.kind === 'repository') {
                  <app-repository-card [entry]="node.entry" />
                }
              }
            </div>
            @for (node of nodes; track $index) {
              @if (node.kind === 'folder') {
                <ui-tree-folder [name]="node.name" [level]="level">
                  <ng-container
                    *ngTemplateOutlet="
                      branch;
                      context: { $implicit: node.children, level: level + 1 }
                    "
                  />
                </ui-tree-folder>
              }
            }
          </ng-template>

          <section aria-label="Directories">
            <ng-container
              *ngTemplateOutlet="branch; context: { $implicit: tree().nodes, level: 2 }"
            />
          </section>

          <section
            aria-labelledby="repositories-other"
            [class]="tree().other.length ? 'block' : 'hidden'"
          >
            <h2
              id="repositories-other"
              class="mt-0 mb-2 text-sm font-semibold text-charcoal-brown-700"
            >
              Not in the wrapper
            </h2>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-6">
              @for (entry of tree().other; track entry.repository?.id) {
                <app-repository-card [entry]="entry" />
              }
            </div>
          </section>
        </div>
      </ui-spinner>
    </div>
  `,
})
export class ProjectRepositoriesPage {
  private readonly selected = inject(SelectedProject);
  private readonly store = inject(RepositoriesStore);

  private readonly repositories = computed(() => {
    const id = this.selected.project()?.id;
    return id ? this.store.byProject()[id] : undefined;
  });

  protected readonly tree = computed(() => {
    const repositories = this.repositories();
    return repositoryTree(repositories?.entries ?? [], repositories?.wrapper);
  });

  protected readonly state = computed((): LoadState => {
    const status = this.repositories()?.status;
    return status === 'loaded' || status === 'error' ? status : 'loading';
  });

  constructor() {
    // In the browser only (the server render has no session cookie). Only the project id is
    // tracked: `load` reads the store's state, and tracking that would fetch again on every answer.
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    effect(() => {
      const id = this.selected.project()?.id;
      if (browser && id) untracked(() => void this.store.load(id));
    });
  }
}
