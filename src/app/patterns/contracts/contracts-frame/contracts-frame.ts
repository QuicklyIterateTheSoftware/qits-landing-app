import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { docsUrl, type BundleLookup } from '$core/contracts/contracts-view';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { PageLayoutComponent } from '$layout/page-layout/page-layout';
import { Spinner, type LoadState } from '$ui/components/spinner/spinner';

/**
 * The frame of a repository's contracts and entities pages (qits-1994): the page's heading, the
 * repository, the bundle's site and version with its link into qits-docs' reader, the Contracts
 * and Entities tabs (declared exits, `switch-contracts-section`, epic qits-2000: each marked
 * current by `[qitsExit]` on its list and the pages below it), and why there is nothing to show when the repository has no readable bundle
 * (`lookup`). The page's own content is projected and drawn only once the bundle is found.
 */
@Component({
  selector: 'app-contracts-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageLayoutComponent, QitsExit, Spinner],
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-6xl px-6 pt-8 pb-12">
      <app-page-layout>
        <div slot="header" class="flex flex-col gap-1">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 class="m-0 text-3xl leading-[1.1] font-bold break-all">{{ heading() }}</h1>
            <span class="repo font-mono text-charcoal-brown-700">{{ repo() }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <nav aria-label="Bundle" class="flex gap-1">
              @for (section of sections; track section.id) {
                <a
                  class="section rounded bg-charcoal-brown-100 px-2 py-0.5 text-xs font-semibold text-charcoal-brown-700 not-aria-[current=page]:hover:bg-charcoal-brown-200 aria-[current=page]:bg-charcoal-brown-800 aria-[current=page]:text-white"
                  [qitsExit]="section.exit"
                  [exitParams]="{ slug: slug(), repo: repo() }"
                  >{{ section.label }}</a
                >
              }
            </nav>
            @if (site(); as s) {
              <span class="site font-mono text-xs text-charcoal-brown-600"
                >{{ s.site }} {{ s.version }}</span
              >
              @if (docs(); as url) {
                <a class="docs text-xs font-semibold" [href]="url" target="_blank" rel="noopener"
                  >Docs ↗</a
                >
              }
            }
          </div>
        </div>
        <ui-spinner [state]="state()" class="min-h-32">
          @let l = lookup();
          @switch (l.status) {
            @case ('none') {
              <p class="none m-0 text-sm text-charcoal-brown-600">
                No contracts bundle is published for {{ repo() }}.
              </p>
            }
            @case ('unreadable') {
              @if (l.status === 'unreadable') {
                <p class="unreadable m-0 text-sm text-cinnabar-700">
                  Could not read {{ l.sites.join(', ') }}, so whether {{ repo() }} publishes a
                  contracts bundle is not known.
                </p>
              }
            }
            @case ('loaded') {
              <ng-content />
            }
          }
        </ui-spinner>
      </app-page-layout>
    </div>
  `,
})
export class ContractsFrame {
  readonly heading = input.required<string>();
  readonly slug = input.required<string>();
  readonly repo = input.required<string>();
  readonly lookup = input.required<BundleLookup>();

  private readonly origins = inject(PlatformOrigins);

  protected readonly site = computed(() => {
    const l = this.lookup();
    return l.status === 'loaded' ? l.site : null;
  });

  protected readonly docs = computed(() => {
    const site = this.site();
    return site ? docsUrl(this.origins.page('docs'), site) : null;
  });

  protected readonly state = computed((): LoadState => {
    const status = this.lookup().status;
    return status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'loaded';
  });

  protected readonly switching = outcomes('switch-contracts-section', {
    contracts: exit('projects/:slug/repositories/:repo/contracts'),
    entities: exit('projects/:slug/repositories/:repo/entities'),
  });

  /** The bundle's two lists, one exit each. */
  protected readonly sections = [
    { id: 'contracts', label: 'Contracts', exit: this.switching.contracts },
    { id: 'entities', label: 'Entities', exit: this.switching.entities },
  ];
}
