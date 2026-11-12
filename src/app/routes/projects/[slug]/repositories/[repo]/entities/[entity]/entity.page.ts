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
import { QitsMermaidDiagram } from '@qits/ui-components';
import { map } from 'rxjs';
import { ContractsBundleStore } from '$core/contracts/contracts-bundle.store';
import {
  bundleOf,
  byKind,
  DTO_KINDS,
  kindNote,
  OPERATION_KINDS,
  projectionLink,
  projectionTarget,
  providerSite,
  simpleName,
  sortedDtos,
  statesRecording,
} from '$core/contracts/contracts-view';
import { EntityMapStore, type ContractsSite } from '$core/ui-builder/entity-map.store';
import type { GoldenState } from '$core/ui-builder/golden-masters.store';
import { ContractsFrame } from '$patterns/contracts/contracts-frame/contracts-frame';
import { ErDiagramBox } from '$patterns/contracts/er-diagram-box/er-diagram-box';
import { Chip } from '$ui/components/chip/chip';

/**
 * One entity of a repository's entity map (qits-1994), at
 * `/projects/<slug>/repositories/<repo>/entities/<fully qualified class name>`: its class, table
 * and marking; why a technical one is; what a projection projects, linked to that entity's page
 * when its application's bundle is known (`projectionLink`: the application's contracts site and
 * its map, matched by simple name); its known gap; the DTOs that carry it, most direct link first,
 * each kind explained; and the operations that hand it out, each linked to the states of the same
 * bundle that record that operationId (its `golden-masters/index.json`); and the ER diagram of the
 * persistence unit holding it (qits-2014: the bundle's `database/index.json` names the unit, its
 * `database/<file>.md` holds the diagram, `ContractsBundleStore.readDiagram`), drawn at its natural
 * size in a scroll box scrolled to the entity's table (`ErDiagramBox`). A bundle publishing no
 * diagram, or none for this entity's unit, says so in a line; it is not an error.
 *
 * A class the map does not list says so, with a link back to the list.
 *
 * The links are declared exits (epic qits-2000): back to the list (`leave-entity` `allEntities`),
 * the projected entity (`open-entity-relation` `projectionOf`) and a recording state
 * (`open-entity-relation` `recordedIn`).
 *
 * Staleness (qits-1270): a release of the repository → the catalog (`EntityMapStore.follow`); the
 * maps and the index are keyed by version and never go stale.
 */
@Component({
  selector: 'app-entity-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, ContractsFrame, ErDiagramBox, QitsExit, QitsMermaidDiagram],
  host: { class: 'block' },
  template: `
    <app-contracts-frame
      [heading]="entity() ? name(entity()!.entity) : 'Entity'"
      [slug]="slug()"
      [repo]="repo()"
      [lookup]="lookup()"
    >
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
          @if (entity(); as e) {
            <div class="flex flex-col gap-6 text-sm">
              <section class="flex flex-col gap-2">
                <p class="m-0">
                  <a
                    class="back text-xs font-semibold"
                    [qitsExit]="leaving.allEntities"
                    [exitParams]="{ slug: slug(), repo: repo() }"
                    >← All entities</a
                  >
                </p>
                <dl class="facts m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt class="text-fg-muted">Class</dt>
                  <dd class="fqn m-0 font-mono break-all">{{ e.entity }}</dd>
                  <dt class="text-fg-muted">Table</dt>
                  <dd class="m-0 font-mono">{{ e.table ?? '—' }}</dd>
                  <dt class="text-fg-muted">Marking</dt>
                  <dd class="marking m-0">{{ e.marking }}</dd>
                  @if (e.marking === 'technical') {
                    <dt class="text-fg-muted">Reason</dt>
                    <dd class="reason m-0">{{ e.reason ?? '—' }}</dd>
                  }
                  @if (e.marking === 'projection') {
                    <dt class="text-fg-muted">Projection of</dt>
                    <dd class="projection m-0 font-mono">
                      @if (projection(); as p) {
                        <a
                          [qitsExit]="relating.projectionOf"
                          [exitParams]="{ slug: slug(), repo: p.repository, entity: p.entity }"
                          >{{ e.projectionOf }}</a
                        >
                      } @else {
                        {{ e.projectionOf ?? '—' }}
                      }
                    </dd>
                  }
                  @if (e.knownGap; as gap) {
                    <dt class="text-fg-muted">Known gap</dt>
                    <dd class="m-0"><ui-chip class="gap" tone="waiting" [label]="gap" /></dd>
                  }
                </dl>
              </section>

              <section class="er-diagram">
                <h2 class="m-0 mb-1 text-base font-semibold">ER diagram</h2>
                @let diagram = diagramRead();
                @if (diagram?.status === 'loaded') {
                  <p class="unit m-0 mb-2 text-xs text-fg-soft">
                    Persistence unit <span class="font-mono">{{ diagram.unit }}</span>
                  </p>
                  <div
                    class="diagram-box max-h-[70vh] overflow-auto rounded border border-line-subtle"
                    [appErDiagramBox]="diagram.table"
                  >
                    <qits-mermaid-diagram
                      class="w-max min-w-full"
                      [definition]="diagram.definition"
                      [label]="'ER diagram of the persistence unit ' + diagram.unit"
                    />
                  </div>
                } @else if (diagram?.status === 'none') {
                  <p class="no-diagram m-0 text-fg-soft">
                    No ER diagram published for this entity.
                  </p>
                } @else if (diagram?.status === 'error') {
                  <p class="diagram-error m-0 text-danger">Could not read the ER diagram.</p>
                } @else {
                  <p class="m-0 text-fg-soft">Reading the ER diagram…</p>
                }
              </section>

              <section>
                <h2 class="m-0 mb-1 text-base font-semibold">DTOs</h2>
                @for (dto of dtos(); track dto.type) {
                  <div class="dto border-b border-line-subtle py-1.5">
                    <p class="m-0 flex flex-wrap items-center gap-1.5">
                      <span class="font-mono text-xs font-semibold break-all">{{ dto.type }}</span>
                      <ui-chip class="kind" [label]="dto.kind" />
                      @if (dto.via; as via) {
                        <span class="via text-xs text-fg-soft"
                          >via <span class="font-mono">{{ via }}</span></span
                        >
                      }
                    </p>
                    @if (dtoNote(dto.kind); as note) {
                      <p class="note m-0 text-xs text-fg-soft">{{ note }}</p>
                    }
                    @if (dto.site; as site) {
                      <p class="m-0 font-mono text-xs break-all text-fg-muted">
                        {{ site }}
                      </p>
                    }
                  </div>
                } @empty {
                  <p class="m-0 text-fg-soft">No operation hands out a DTO of it.</p>
                }
              </section>

              <section>
                <h2 class="m-0 mb-1 text-base font-semibold">Operations</h2>
                @for (op of operations(); track op.operationId + op.method + op.path) {
                  <div class="operation border-b border-line-subtle py-1.5">
                    <p class="m-0 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                      <span class="font-semibold">{{ op.operationId }}</span>
                      <span class="rounded bg-surface-muted px-1 font-semibold">{{
                        op.method
                      }}</span>
                      <span class="break-all">{{ op.path }}</span>
                      @if (op.kind; as kind) {
                        <ui-chip class="kind font-sans" [label]="kind" />
                      }
                    </p>
                    @if (op.dto; as dto) {
                      <p class="m-0 font-mono text-xs break-all text-fg-soft">
                        {{ dto }}
                      </p>
                    }
                    @if (operationNote(op.kind); as note) {
                      <p class="note m-0 text-xs text-fg-soft">{{ note }}</p>
                    }
                    @let recorded = recordedBy(op.operationId);
                    @if (recorded === null) {
                      <p class="m-0 text-xs text-fg-muted">{{ indexNote() }}</p>
                    } @else if (recorded.length) {
                      <p class="states m-0 flex flex-wrap gap-x-2 text-xs">
                        <span class="text-fg-muted">Recorded in</span>
                        @for (s of recorded; track s.slug) {
                          <a
                            [qitsExit]="relating.recordedIn"
                            [exitParams]="{ slug: slug(), repo: repo(), state: s.slug }"
                            >{{ s.name }}</a
                          >
                        }
                      </p>
                    } @else {
                      <p class="m-0 text-xs text-fg-muted">No state records it.</p>
                    }
                  </div>
                } @empty {
                  <p class="m-0 text-fg-soft">No operation hands it out.</p>
                }
              </section>
            </div>
          } @else {
            <p class="unknown m-0 text-sm text-fg-soft">
              No such entity in {{ read?.status === 'loaded' ? read.map.application : '' }}
              {{ site()?.version }}.
              <a
                class="back font-semibold"
                [qitsExit]="leaving.allEntities"
                [exitParams]="{ slug: slug(), repo: repo() }"
                >All entities</a
              >
            </p>
          }
        }
        @default {
          <p class="m-0 text-sm text-fg-soft">Reading the entity map…</p>
        }
      }
    </app-contracts-frame>
  `,
})
export class EntityPage {
  private readonly entityMaps = inject(EntityMapStore);
  private readonly bundles = inject(ContractsBundleStore);
  private readonly route = inject(ActivatedRoute);

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(
      map((params) => ({
        slug: params.get('slug') ?? '',
        repo: params.get('repo') ?? '',
        entity: params.get('entity') ?? '',
      })),
    ),
    { initialValue: { slug: '', repo: '', entity: '' } },
  );
  protected readonly slug = computed(() => this.routeParams().slug);
  protected readonly repo = computed(() => this.routeParams().repo);

  protected readonly leaving = outcomes('leave-entity', {
    allEntities: exit('projects/:slug/repositories/:repo/entities'),
  });
  protected readonly relating = outcomes('open-entity-relation', {
    projectionOf: exit('projects/:slug/repositories/:repo/entities/:entity'),
    recordedIn: exit('projects/:slug/repositories/:repo/contracts/:state'),
  });

  protected readonly lookup = computed(() => bundleOf(this.entityMaps.catalog(), this.repo()));

  protected readonly site = computed(() => {
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

  protected readonly entity = computed(() => {
    const read = this.mapRead();
    const fqn = this.routeParams().entity;
    return read?.status === 'loaded'
      ? (read.map.entities.find((e) => e.entity === fqn) ?? null)
      : null;
  });

  protected readonly dtos = computed(() => sortedDtos(this.entity()?.dtos ?? []));

  protected readonly operations = computed(() =>
    byKind(this.entity()?.operations ?? [], OPERATION_KINDS, (op) => op.operationId),
  );

  private readonly sites = computed((): readonly ContractsSite[] => {
    const catalog = this.entityMaps.catalog();
    return catalog?.status === 'loaded' ? catalog.sites : [];
  });

  /** The site of the application a projection projects, whose map `projectionLink` reads. */
  private readonly projectionSite = computed(() => {
    const target = projectionTarget(this.entity()?.projectionOf ?? null);
    return target ? providerSite(this.sites(), target.application) : null;
  });

  protected readonly projection = computed(() =>
    projectionLink(this.entity()?.projectionOf ?? null, this.sites(), (site) =>
      this.entityMaps.mapRead(site),
    ),
  );

  private readonly indexRead = computed(() => {
    const site = this.site();
    return site ? this.bundles.indexRead(site) : undefined;
  });

  /** The ER diagram of the unit holding the page's entity, from the same bundle. */
  protected readonly diagramRead = computed(() => {
    const site = this.site();
    return site ? this.bundles.diagramRead(site, this.routeParams().entity) : undefined;
  });

  /** Why no operation names its states: the index is being read, or could not be. */
  protected readonly indexNote = computed(() =>
    this.indexRead()?.status === 'error'
      ? 'Could not read the golden masters, so which states record it is not known.'
      : 'Reading the golden masters…',
  );

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) void this.entityMaps.load();
    effect(() => {
      const site = this.site();
      if (browser && site) {
        untracked(() => {
          this.entityMaps.readMap(site);
          this.bundles.readIndex(site);
        });
      }
    });
    effect(() => {
      const site = this.site();
      const entity = this.routeParams().entity;
      if (browser && site && entity) {
        untracked(() => this.bundles.readDiagram(site, entity));
      }
    });
    effect(() => {
      const site = this.projectionSite();
      if (browser && site) untracked(() => this.entityMaps.readMap(site));
    });
    this.entityMaps.follow(() => this.repo() || undefined, inject(DestroyRef));
  }

  /** The states that record `operationId`; null until the index is read. */
  protected recordedBy(operationId: string): readonly GoldenState[] | null {
    const read = this.indexRead();
    return read?.status === 'loaded' ? statesRecording(read.index, operationId) : null;
  }

  protected name(entity: string): string {
    return simpleName(entity);
  }

  protected dtoNote(kind: string): string | null {
    return kindNote(DTO_KINDS, kind);
  }

  protected operationNote(kind: string | null): string | null {
    return kindNote(OPERATION_KINDS, kind);
  }
}
