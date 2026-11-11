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
import { ContractsBundleStore, type RecordingRead } from '$core/contracts/contracts-bundle.store';
import {
  bundleOf,
  dependencyRows,
  dependencySites,
  keyValues,
  statesOf,
} from '$core/contracts/contracts-view';
import { EntityMapStore, type ContractsSite } from '$core/ui-builder/entity-map.store';
import type { GoldenOperation } from '$core/ui-builder/golden-masters.store';
import { ContractsFrame } from '$patterns/contracts/contracts-frame/contracts-frame';
import { JsonBlock } from '$ui/components/json-block/json-block';

/**
 * One provider state of a repository's contracts bundle (qits-1994), at
 * `/projects/<slug>/repositories/<repo>/contracts/<state slug>`: its name and slug, its params, what
 * it depends on, and every operation it records (method, path, query, request body, status) with
 * the recorded response pretty-printed, read lazily per operation
 * (`ContractsBundleStore.readRecording`). An operation the index records no file for (a byte
 * answer, qits-1934) shows its status, media type and response headers instead.
 *
 * A dependency on a state of another provider links to that provider's repository's state page
 * when the catalog names its repository and its index lists the state (`dependencyRows`); that
 * index is read for the link. A slug the index does not list says so, with a link back to the list.
 * The links are declared exits (epic qits-2000): back to the list (`leave-contract-state`
 * `allStates`) and a dependency's state (`open-state-dependency` `dependency`).
 *
 * Staleness (qits-1270): as the list's (`ContractsPage`): a release → the catalog; the index and
 * the recordings are keyed by version and never go stale.
 */
@Component({
  selector: 'app-contract-state-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContractsFrame, JsonBlock, QitsExit],
  host: { class: 'block' },
  template: `
    <app-contracts-frame
      [heading]="state()?.name ?? 'Provider state'"
      [slug]="slug()"
      [repo]="repo()"
      [lookup]="lookup()"
    >
      @let read = indexRead();
      @switch (read?.status) {
        @case ('error') {
          <p class="index-error m-0 text-sm text-cinnabar-700">
            Could not read the golden masters of {{ siteLabel() }}.
          </p>
        }
        @case ('loaded') {
          @if (state(); as s) {
            <div class="flex flex-col gap-6 text-sm">
              <section class="flex flex-col gap-2">
                <p class="m-0">
                  <a
                    class="back text-xs font-semibold"
                    [qitsExit]="leaving.allStates"
                    [exitParams]="{ slug: slug(), repo: repo() }"
                    >← All states</a
                  >
                </p>
                <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt class="text-charcoal-brown-500">Slug</dt>
                  <dd class="slug m-0 font-mono break-all">{{ s.slug }}</dd>
                </dl>
              </section>

              <section>
                <h2 class="m-0 mb-1 text-base font-semibold">Params</h2>
                @if (params().length) {
                  <table class="params border-collapse font-mono text-xs">
                    <tbody>
                      @for (p of params(); track p.key) {
                        <tr class="border-b border-charcoal-brown-100 align-top">
                          <th class="py-0.5 pr-3 text-left font-normal text-charcoal-brown-500">
                            {{ p.key }}
                          </th>
                          <td class="py-0.5 break-all">{{ p.value }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                } @else {
                  <p class="m-0 text-charcoal-brown-600">None</p>
                }
              </section>

              <section>
                <h2 class="m-0 mb-1 text-base font-semibold">Depends on</h2>
                @if (dependencies().length) {
                  <ul class="depends m-0 list-none p-0">
                    @for (d of dependencies(); track d.label) {
                      <li>
                        @if (d.link; as l) {
                          <a
                            [qitsExit]="following.dependency"
                            [exitParams]="{ slug: slug(), repo: l.repository, state: l.slug }"
                            >{{ d.label }}</a
                          >
                        } @else {
                          {{ d.label }}
                        }
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="depends m-0 text-charcoal-brown-600">None</p>
                }
              </section>

              <section class="flex flex-col gap-3">
                <h2 class="m-0 text-base font-semibold">Operations</h2>
                @for (op of s.operations; track $index) {
                  <article
                    class="operation flex min-w-0 flex-col gap-2 rounded-lg border border-charcoal-brown-200 p-3"
                  >
                    <h3 class="m-0 flex flex-wrap items-center gap-1.5 font-mono text-xs">
                      <span class="font-semibold">{{ op.operationId }}</span>
                      <span class="rounded bg-charcoal-brown-100 px-1 font-semibold">{{
                        op.method
                      }}</span>
                      <span class="break-all">{{ op.path }}</span>
                      <span
                        class="status rounded px-1 font-semibold"
                        [class]="
                          op.status < 300
                            ? 'bg-mint-leaf-100 text-mint-leaf-800'
                            : 'bg-sunflower-gold-100 text-sunflower-gold-800'
                        "
                        >{{ op.status }}</span
                      >
                    </h3>
                    @if (op.query; as query) {
                      <div>
                        <h4 class="m-0 text-xs font-semibold text-charcoal-brown-700 uppercase">
                          Query
                        </h4>
                        <dl class="query m-0 grid grid-cols-[auto_1fr] gap-x-2 font-mono text-xs">
                          @for (q of entries(query); track q.key) {
                            <dt class="text-charcoal-brown-500">{{ q.key }}</dt>
                            <dd class="m-0 break-all">{{ q.value }}</dd>
                          }
                        </dl>
                      </div>
                    }
                    @if (op.body !== undefined) {
                      <ui-json-block
                        class="request-body"
                        heading="Request body"
                        [json]="pretty(op.body)"
                      />
                    }
                    @if (op.file === null) {
                      <div class="bytes text-xs">
                        <p class="m-0 text-charcoal-brown-600">
                          Status {{ op.status }}{{ op.contentType ? ', ' + op.contentType : '' }};
                          no JSON body is recorded.
                        </p>
                        @if (op.responseHeaders; as headers) {
                          <h4
                            class="m-0 mt-1 text-xs font-semibold text-charcoal-brown-700 uppercase"
                          >
                            Response headers
                          </h4>
                          <dl class="headers m-0 grid grid-cols-[auto_1fr] gap-x-2 font-mono">
                            @for (h of entries(headers); track h.key) {
                              <dt class="text-charcoal-brown-500">{{ h.key }}</dt>
                              <dd class="m-0 break-all">{{ h.value }}</dd>
                            }
                          </dl>
                        }
                      </div>
                    } @else {
                      @let r = recording(op);
                      @switch (r?.status) {
                        @case ('loaded') {
                          @if (r?.status === 'loaded') {
                            <ui-json-block class="response" [json]="r.json" />
                          }
                        }
                        @case ('error') {
                          <p class="m-0 text-xs text-cinnabar-700">
                            Could not read the recorded response.
                          </p>
                        }
                        @case ('none') {
                          <p class="m-0 text-xs text-charcoal-brown-600">
                            The response has no JSON body.
                          </p>
                        }
                        @default {
                          <p class="m-0 text-xs text-charcoal-brown-600">Reading…</p>
                        }
                      }
                    }
                  </article>
                } @empty {
                  <p class="m-0 text-charcoal-brown-600">The state records no operation.</p>
                }
              </section>
            </div>
          } @else {
            <p class="unknown m-0 text-sm text-charcoal-brown-600">
              No such state in {{ application() }} {{ site()?.version }}.
              <a
                class="back font-semibold"
                [qitsExit]="leaving.allStates"
                [exitParams]="{ slug: slug(), repo: repo() }"
                >All states</a
              >
            </p>
          }
        }
        @default {
          <p class="m-0 text-sm text-charcoal-brown-600">Reading the golden masters…</p>
        }
      }
    </app-contracts-frame>
  `,
})
export class ContractStatePage {
  private readonly entityMaps = inject(EntityMapStore);
  private readonly bundles = inject(ContractsBundleStore);
  private readonly route = inject(ActivatedRoute);

  private readonly routeParams = toSignal(
    this.route.paramMap.pipe(
      map((params) => ({
        slug: params.get('slug') ?? '',
        repo: params.get('repo') ?? '',
        state: params.get('state') ?? '',
      })),
    ),
    { initialValue: { slug: '', repo: '', state: '' } },
  );
  protected readonly slug = computed(() => this.routeParams().slug);
  protected readonly repo = computed(() => this.routeParams().repo);

  protected readonly leaving = outcomes('leave-contract-state', {
    allStates: exit('projects/:slug/repositories/:repo/contracts'),
  });
  protected readonly following = outcomes('open-state-dependency', {
    dependency: exit('projects/:slug/repositories/:repo/contracts/:state'),
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

  protected readonly indexRead = computed(() => {
    const site = this.site();
    return site ? this.bundles.indexRead(site) : undefined;
  });

  private readonly index = computed(() => {
    const read = this.indexRead();
    return read?.status === 'loaded' ? read.index : null;
  });

  /** The index's provider (`qits-projects`), else the site's name. */
  protected readonly application = computed(
    () => this.index()?.provider ?? this.site()?.site ?? '',
  );

  protected readonly state = computed(() => {
    const index = this.index();
    const slug = this.routeParams().state;
    return index ? (statesOf(index).find((s) => s.slug === slug) ?? null) : null;
  });

  /** The state's params as key/value rows. */
  protected readonly params = computed(() => keyValues(this.state()?.params));

  private readonly sites = computed((): readonly ContractsSite[] => {
    const catalog = this.entityMaps.catalog();
    return catalog?.status === 'loaded' ? catalog.sites : [];
  });

  protected readonly dependencies = computed(() => {
    const site = this.site();
    const index = this.index();
    const state = this.state();
    if (!site || !index || !state) return [];
    return dependencyRows(state.dependsOn, { site, index }, this.sites(), (other) => {
      const read = this.bundles.indexRead(other);
      return read?.status === 'loaded' ? read.index : null;
    });
  });

  constructor() {
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) void this.entityMaps.load();
    effect(() => {
      const site = this.site();
      if (browser && site) untracked(() => this.bundles.readIndex(site));
    });
    effect(() => {
      const site = this.site();
      const state = this.state();
      if (!browser || !site || !state) return;
      const others = dependencySites(state.dependsOn, this.sites());
      untracked(() => {
        for (const op of state.operations) this.bundles.readRecording(site, op);
        for (const other of others) this.bundles.readIndex(other);
      });
    });
    this.entityMaps.follow(() => this.repo() || undefined, inject(DestroyRef));
  }

  protected recording(op: GoldenOperation): RecordingRead | undefined {
    const site = this.site();
    return site ? this.bundles.recordingRead(site, op) : undefined;
  }

  protected entries(record: Readonly<Record<string, unknown>>) {
    return keyValues(record);
  }

  protected pretty(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
