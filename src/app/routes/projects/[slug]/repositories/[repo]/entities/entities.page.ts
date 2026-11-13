import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { map } from 'rxjs';
import { bundleOf, entityGroups, simpleName } from '$core/contracts/contracts-view';
import { ContractsCatalog } from '$core/ui-builder/contracts-catalog';
import { ContractsFrame } from '$patterns/contracts/contracts-frame/contracts-frame';
import { Chip } from '$ui/components/chip/chip';

/**
 * A repository's entity map (qits-1994), at `/projects/<slug>/repositories/<repo>/entities`: every
 * persisted entity of the service's published `entities.json` (qits-1945), grouped by marking
 * (domain, technical, projection), one row each (simple name, table, how many operations hand it
 * out, its known gap), linking to the entity's page (a declared exit, `open-listed-entity` `entity`,
 * epic qits-2000).
 *
 * The bundle is found as on the contracts pages (`bundleOf`); its map is `ContractsCatalog.readMap`,
 * the UI builder's read. A version without an `entities.json` publishes no map, which is said.
 *
 * Staleness (qits-1270): a release of the repository → the catalog (`ContractsCatalog.follow`); a
 * map is keyed by its version and never goes stale.
 */
@Component({
  selector: 'app-entities-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, ContractsFrame, QitsExit],
  host: { class: 'block' },
  template: `
    <app-contracts-frame heading="Entities" [slug]="slug()" [repo]="repo()" [lookup]="lookup()">
      @let read = mapRead();
      @switch (read?.status) {
        @case ('error') {
          <p class="map-error m-0 text-sm text-danger">
            Could not read the entity map of {{ siteLabel() }}.
          </p>
        }
        @case ('none') {
          <p class="no-map m-0 text-sm text-fg-soft">{{ siteLabel() }} publishes no entity map.</p>
        }
        @case ('loaded') {
          <div
            class="flex flex-col gap-5 text-sm"
            data-qits-source="qits-artifacts-service#getDocsFile"
          >
            @for (group of groups(); track group.marking) {
              <section class="marking">
                <h2 class="m-0 mb-1 text-base font-semibold capitalize">
                  {{ group.marking }}
                  <span class="text-xs font-normal text-fg-soft">{{ group.entities.length }}</span>
                </h2>
                <table class="w-full border-collapse text-left">
                  <thead>
                    <tr class="border-b border-line text-xs text-fg-soft">
                      <th class="py-1 pr-3 font-semibold">Entity</th>
                      <th class="py-1 pr-3 font-semibold">Table</th>
                      <th class="py-1 text-right font-semibold">Operations</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (e of group.entities; track e.entity) {
                      <tr class="entity border-b border-line-subtle align-top">
                        <td class="py-1 pr-3">
                          <span class="flex flex-wrap items-center gap-1.5">
                            <a
                              class="font-semibold"
                              [qitsExit]="opening.entity"
                              [exitParams]="{ slug: slug(), repo: repo(), entity: e.entity }"
                              >{{ name(e.entity) }}</a
                            >
                            @if (e.knownGap; as gap) {
                              <ui-chip class="gap" tone="waiting" [label]="'Known gap ' + gap" />
                            }
                          </span>
                        </td>
                        <td class="py-1 pr-3 font-mono text-xs">{{ e.table ?? '—' }}</td>
                        <td class="py-1 text-right tabular-nums">{{ e.operations.length }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </section>
            } @empty {
              <p class="m-0 text-fg-soft">The map lists no entity.</p>
            }
          </div>
        }
        @default {
          <p class="m-0 text-sm text-fg-soft">Reading the entity map…</p>
        }
      }
    </app-contracts-frame>
  `,
})
export class EntitiesPage {
  private readonly entityMaps = inject(ContractsCatalog);
  private readonly route = inject(ActivatedRoute);

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(
      map((params) => ({ slug: params.get('slug') ?? '', repo: params.get('repo') ?? '' })),
    ),
    { initialValue: { slug: '', repo: '' } },
  );
  protected readonly slug = computed(() => this.routeParams().slug);
  protected readonly repo = computed(() => this.routeParams().repo);

  protected readonly opening = outcomes('open-listed-entity', {
    entity: exit('projects/:slug/repositories/:repo/entities/:entity'),
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

  protected readonly mapRead = computed(() => {
    const site = this.site();
    return site ? this.entityMaps.mapRead(site) : undefined;
  });

  protected readonly groups = computed(() => {
    const read = this.mapRead();
    return read?.status === 'loaded' ? entityGroups(read.map) : [];
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) this.entityMaps.load();
    effect(() => {
      const site = this.site();
      if (browser && site) untracked(() => this.entityMaps.readMap(site));
    });
    this.entityMaps.follow(() => this.repo() || undefined, inject(DestroyRef));
  }

  protected name(entity: string): string {
    return simpleName(entity);
  }
}
