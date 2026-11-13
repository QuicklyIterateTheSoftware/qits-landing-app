import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { map } from 'rxjs';
import { ContractsBundles } from '$core/contracts/contracts-bundles';
import { bundleOf, filterRows, stateRows } from '$core/contracts/contracts-view';
import { ContractsCatalog } from '$core/ui-builder/contracts-catalog';
import { ContractsFrame } from '$patterns/contracts/contracts-frame/contracts-frame';

/**
 * A repository's provider states (qits-1994), at `/projects/<slug>/repositories/<repo>/contracts`:
 * every state the service's published contracts bundle records, from its
 * `golden-masters/index.json`, one row each (name, how many operations it records, which), linking
 * to the state's page (a declared exit, `open-listed-contract-state` `state`, epic qits-2000), with a
 * filter on the name.
 *
 * The bundle is the `@contracts/` site whose newest version's `git.repository.name` is the
 * repository (`ContractsCatalog`'s catalog, `contractsSiteOf`); its index is read through
 * `ContractsBundles.readIndex`. The data is read in the browser only.
 *
 * Staleness (qits-1270): a release of the repository → the catalog (`ContractsCatalog.follow`); the
 * index is keyed by its version, which never changes, so it never goes stale.
 */
@Component({
  selector: 'app-contracts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContractsFrame, QitsExit],
  host: { class: 'block' },
  template: `
    <app-contracts-frame heading="Contracts" [slug]="slug()" [repo]="repo()" [lookup]="lookup()">
      @let read = indexRead();
      @switch (read?.status) {
        @case ('error') {
          <p class="index-error m-0 text-sm text-danger">
            Could not read the golden masters of {{ siteLabel() }}.
          </p>
        }
        @case ('loaded') {
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-3">
              <input
                class="h-8 w-72 max-w-full rounded-md border border-line-strong px-2 text-sm"
                type="search"
                aria-label="Filter states"
                placeholder="Filter by name"
                [value]="filter()"
                (input)="filter.set(value($event))"
              />
              <span class="count text-xs text-fg-soft"
                >{{ shown().length }} of {{ rows().length }}
                {{ rows().length === 1 ? 'state' : 'states' }}</span
              >
            </div>
            <table
              class="states w-full border-collapse text-left text-sm"
              data-qits-source="qits-artifacts-service#getDocsFile"
            >
              <thead>
                <tr class="border-b border-line text-xs text-fg-soft">
                  <th class="py-1 pr-3 font-semibold">State</th>
                  <th class="py-1 pr-3 text-right font-semibold">Operations</th>
                  <th class="py-1 font-semibold">Recorded</th>
                </tr>
              </thead>
              <tbody>
                @for (row of shown(); track row.slug) {
                  <tr class="state border-b border-line-subtle align-top">
                    <td class="py-1 pr-3">
                      <a
                        class="font-semibold"
                        [qitsExit]="opening.state"
                        [exitParams]="{ slug: slug(), repo: repo(), state: row.slug }"
                        >{{ row.name }}</a
                      >
                    </td>
                    <td class="py-1 pr-3 text-right tabular-nums">{{ row.operationCount }}</td>
                    <td class="py-1 font-mono text-xs break-all text-fg-soft">
                      {{ row.operationIds.join(', ') }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="py-2 text-fg-soft">
                      {{ rows().length ? 'No state matches the filter.' : 'No states recorded.' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @default {
          <p class="m-0 text-sm text-fg-soft">Reading the golden masters…</p>
        }
      }
    </app-contracts-frame>
  `,
})
export class ContractsPage {
  private readonly entityMaps = inject(ContractsCatalog);
  private readonly bundles = inject(ContractsBundles);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(
    this.route.paramMap.pipe(
      map((params) => ({ slug: params.get('slug') ?? '', repo: params.get('repo') ?? '' })),
    ),
    { initialValue: { slug: '', repo: '' } },
  );
  protected readonly slug = computed(() => this.params().slug);
  protected readonly repo = computed(() => this.params().repo);

  protected readonly opening = outcomes('open-listed-contract-state', {
    state: exit('projects/:slug/repositories/:repo/contracts/:state'),
  });

  protected readonly lookup = computed(() => bundleOf(this.entityMaps.catalog(), this.repo()));

  private readonly site = computed(() => {
    const lookup = this.lookup();
    return lookup.status === 'loaded' ? lookup.site : null;
  });

  protected readonly siteLabel = computed(() => {
    const site = this.site();
    return site ? `${site.site} ${site.version}` : '';
  });

  protected readonly indexRead = computed(() => {
    const site = this.site();
    return site ? this.bundles.indexRead(site) : undefined;
  });

  protected readonly rows = computed(() => {
    const read = this.indexRead();
    return read?.status === 'loaded' ? stateRows(read.index) : [];
  });

  protected readonly filter = signal('');
  protected readonly shown = computed(() => filterRows(this.rows(), this.filter()));

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) this.entityMaps.load();
    effect(() => {
      const site = this.site();
      if (browser && site) untracked(() => this.bundles.readIndex(site));
    });
    this.entityMaps.follow(() => this.repo() || undefined, inject(DestroyRef));
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
