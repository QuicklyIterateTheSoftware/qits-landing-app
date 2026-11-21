import { ChangeDetectionStrategy, Component, computed, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SelectedProject } from '$core/projects/selected-project';
import { RepositoryPublished } from '$patterns/repositories/repository-published/repository-published';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import type { Action } from '$ui/components/action-button/action';

/**
 * A repository's Artifacts, at `/projects/<slug>/repositories/<repo>/artifacts` (qits-2492), the
 * repository sidebar's Artifacts entry: what the repository publishes (`app-repository-published`,
 * the same list as its page), each linking its artifact store page. Refresh reads it again.
 */
@Component({
  selector: 'app-repository-artifacts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, RepositoryPublished],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout title="Artifacts" [actions]="actions">
        <p class="mt-0 mb-4 text-sm text-fg-soft">
          What {{ repo() }} publishes: its images, packages, daemons and docs sites.
        </p>
        <app-repository-published [repo]="repo()" [slug]="slug()" />
      </app-page-layout>
    </div>
  `,
})
export class RepositoryArtifactsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly selected = inject(SelectedProject);

  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The address's repository name. */
  protected readonly repo = computed(() => this.paramMap().get('repo') ?? '');

  /** The open project's slug. */
  protected readonly slug = computed(
    () => this.selected.slug() ?? this.paramMap().get('slug') ?? '',
  );

  private readonly published = viewChild(RepositoryPublished);

  /** Refresh: reads the artifacts and the docs catalog again. */
  protected readonly actions: readonly Action[] = [
    { label: 'Refresh', variant: 'muted', callback: () => this.published()?.reload() },
  ];
}
