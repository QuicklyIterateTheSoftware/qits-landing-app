import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsExit, qitsResource } from '@qits/angular';
import { parseReadPath } from '$core/docs/doc-url';
import { SelectedProject } from '$core/projects/selected-project';
import { loadState } from '$core/resources/load-state';
import { DOCS_REPOSITORY } from '$core/ui-builder/docs.consumes';
import { DOCS_CATALOG } from '$core/ui-builder/docs.operations';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { LoadFailure } from '$ui/components/load-failure/load-failure';
import { Spinner } from '$ui/components/spinner/spinner';

/**
 * The docs reader's old addresses, `/projects/<slug>/docs/read/<site>[/-/<version>]` (qits-2337),
 * since the reader moved under the repository that published the site (qits-2486). It reads the
 * docs catalog (`DOCS_CATALOG`, in the browser only), finds the site's publisher
 * (`latestRepository`), and replaces the address with the reader under it, the version and the
 * query kept (`follow-moved-docs-site`). A site no repository is named for says so, with a link to
 * the project's Repositories; a failed read offers Retry.
 */
@Component({
  selector: 'app-docs-read-redirect-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadFailure, PageLayoutComponent, QitsExit, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-[72rem] px-6 pt-8 pb-12">
      <app-page-layout [title]="site()">
        <ui-load-failure
          message="The docs catalog could not be read."
          [class.hidden]="state() !== 'error'"
          (retry)="catalog.reload()"
        />
        <ui-spinner [state]="state()" class="min-h-32" [class.hidden]="state() === 'error'">
          <p class="m-0 px-3 py-8 text-center text-sm text-fg-muted" [class.hidden]="!orphan()">
            No repository is named as the publisher of {{ site() }}, so it has no page here.
            <a
              class="text-accent no-underline hover:underline"
              [qitsExit]="moving.repositories"
              [exitParams]="{ slug: slug() }"
              >Repositories</a
            >
          </p>
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class DocsReadRedirectPage {
  private readonly selected = inject(SelectedProject);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly route = inject(ActivatedRoute);

  private readonly url = toSignal(this.route.url, { initialValue: this.route.snapshot.url });
  private readonly query = toSignal(this.route.queryParams, {
    initialValue: this.route.snapshot.queryParams,
  });

  /** The site and the version the old address names: the segments after `projects/:slug/docs`. */
  private readonly read = computed(() =>
    parseReadPath(
      this.url()
        .slice(3)
        .map((segment) => segment.path),
    ),
  );

  protected readonly site = computed(() => this.read().site);

  protected readonly slug = computed(() => this.selected.slug() ?? this.url()[1]?.path ?? '');

  /** The reader under its repository, or the project's Repositories for an orphan site. */
  protected readonly moving = outcomes('follow-moved-docs-site', {
    reader: exit('projects/:slug/repositories/:repo/docs/:site'),
    version: exit('projects/:slug/repositories/:repo/docs/:site/-/:version'),
    repositories: exit('projects/:slug/repositories'),
  });

  /** Every docs site, in the browser only. */
  protected readonly catalog = qitsResource(DOCS_CATALOG, () =>
    this.browser ? { path: { repository: DOCS_REPOSITORY } } : undefined,
  );

  /** The repository that published the site's newest version, once the catalog is read. */
  private readonly publisher = computed(() => {
    if (!this.catalog.hasValue()) return undefined;
    const site = this.catalog.value()?.sites?.find((entry) => entry.name === this.site());
    return site?.latestRepository ?? '';
  });

  /** The catalog is read and names no publisher for the site. */
  protected readonly orphan = computed(() => this.publisher() === '');

  protected readonly state = computed(() => loadState(this.catalog));

  constructor() {
    effect(() => {
      const repo = this.publisher();
      if (!repo) return;
      const { site, version } = this.read();
      const slug = this.slug();
      const behaviour = { replaceUrl: true, queryParams: this.query() };
      void (version
        ? this.moving.version.go({ slug, repo, site, version }, behaviour)
        : this.moving.reader.go({ slug, repo, site }, behaviour));
    });
  }
}
