import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { exit, outcomes, QitsExit } from '@qits/angular';
import { Dropdown } from '$ui/components/dropdown/dropdown';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { ContractsBundles } from '$core/contracts/contracts-bundles';
import { CONTRACTS_MARKS } from '$core/contracts/contracts-marks';
import type { ContractsSite } from '$core/ui-builder/contracts-catalog';
import type { GoldenOperation, GoldenState } from '$core/ui-builder/golden-masters';
import type { FreezeRecord } from '$core/ui-builder/routes-manifest';

/** A domain entity this call touches, for the popover's links into the Entities tab. */
export interface CallEntity {
  /** `<repository>#<entity>`, the Entities tab's key. */
  readonly key: string;
  readonly name: string;
  /** The repository whose entity map lists it, for its entity page. */
  readonly repository: string;
  /** Its fully qualified class name, as `entities.json` writes it. */
  readonly entity: string;
}

/** What the popover has read about the call. */
type Details =
  | { readonly status: 'closed' | 'loading' | 'none' | 'error' }
  | {
      readonly status: 'loaded';
      readonly state: GoldenState;
      readonly operation: GoldenOperation | null;
      /** The recorded response, pretty-printed; null while it is read or when it is not JSON. */
      readonly json: string | null;
      readonly jsonStatus: 'loading' | 'loaded' | 'error' | 'none';
    };

/** The longest preview drawn; the copy button copies all of it. */
const PREVIEW_CHARS = 12_000;

/**
 * One call of a route in the UI builder's calls panel (qits-1999). The row opens a popover with
 * what the platform recorded for the call: the operation (method, path, status), its provider
 * state (params, dependencies), the domain entities it touches, a link to the provider's contracts
 * in qits-docs, and the recorded response as JSON. With the project's slug given (`project`), the
 * state's name links the provider repository's state page and each entity has an "open" link to
 * its entity page beside the button that picks it (qits-1994); without it they stay plain. Both
 * are declared exits (`open-call-contract` `state` and `entity`, epic qits-2000).
 *
 * It reads the provider's `golden-masters/index.json` and the recorded file from its `@contracts/`
 * site (`ContractsBundles.readIndex`, `readRecording`, qits-2146: the contracts pages' reads, so
 * each file is read once) when it first opens, never before. Escape, a click outside
 * or picking an entity closes it.
 *
 * The row is a `ui-dropdown`'s button and the popover its panel, a `dialog` (qits-2081): it floats
 * over the page, so the calls column, which scrolls, does not cut off the 28rem popover sticking
 * out of its 20rem; its content is rendered only while it is open.
 */
@Component({
  selector: 'app-call-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QitsExit, Dropdown],
  host: { class: 'flex' },
  template: `
    @let c = call();
    <ui-dropdown
      #dropdown
      class="w-full"
      triggerClass="call-trigger w-full cursor-pointer rounded px-1 py-0.5 text-left hover:bg-surface-subtle aria-expanded:bg-surface-muted"
      haspopup="dialog"
      panelRole="dialog"
      [panelLabel]="c.operationId + ' in ' + c.state"
      panelClass="w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface shadow-lg"
      (opened)="onOpened()"
    >
      <span
        dropdown-trigger
        class="block font-mono text-xs"
        [attr.data-qits-source]="marks.source"
        data-qits-field="operationId"
        >{{ c.operationId }}</span
      >
      <span
        dropdown-trigger
        class="block text-xs text-fg-muted"
        [attr.data-qits-source]="marks.source"
        data-qits-derived="provider state"
        >{{ c.provider }} · “{{ c.state }}”</span
      >

      @if (dropdown.isOpen()) {
        <div
          dropdown-panel
          class="call-popover flex flex-col gap-3 p-3 text-xs"
          [attr.data-qits-source]="marks.source"
        >
          @let d = details();
          @switch (d.status) {
            @case ('loading') {
              <p class="m-0 text-fg-soft">Reading the golden masters…</p>
            }
            @case ('none') {
              <p class="m-0 text-fg-soft">
                {{
                  site()
                    ? 'The contracts of ' + c.provider + ' list no state “' + c.state + '”.'
                    : 'No contracts published for ' + c.provider + '.'
                }}
              </p>
            }
            @case ('error') {
              <p class="m-0 text-danger">Could not read the golden masters.</p>
            }
            @case ('loaded') {
              @if (loaded(); as l) {
                <section>
                  <h4 class="m-0 mb-1 font-semibold text-fg-soft uppercase">Operation</h4>
                  @if (l.operation; as op) {
                    <p
                      class="m-0 flex flex-wrap items-center gap-1.5 font-mono"
                      [attr.data-qits-item]="marks.state(l.state)"
                      data-qits-derived="operations"
                    >
                      <span class="rounded bg-surface-muted px-1 font-semibold">{{
                        op.method
                      }}</span>
                      <span class="break-all">{{ op.path }}</span>
                      <span
                        class="rounded px-1 font-semibold"
                        [class]="
                          op.status < 300
                            ? 'bg-success-soft text-success-strong'
                            : 'bg-warning-soft text-warning-strong'
                        "
                        >{{ op.status }}</span
                      >
                    </p>
                  } @else {
                    <p class="m-0 text-fg-soft">The state records no {{ c.operationId }}.</p>
                  }
                </section>

                <section [attr.data-qits-item]="marks.state(l.state)">
                  <h4 class="m-0 mb-1 font-semibold text-fg-soft uppercase">State</h4>
                  @if (stateParams(); as params) {
                    <a
                      class="state-link m-0 block font-semibold"
                      data-qits-field="name"
                      [qitsExit]="opening.state"
                      [exitParams]="params"
                      >{{ l.state.name }}</a
                    >
                  } @else {
                    <p class="m-0" data-qits-field="name">{{ l.state.name }}</p>
                  }
                  @if (params().length) {
                    <dl
                      class="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-2 font-mono"
                      data-qits-derived="params"
                    >
                      @for (p of params(); track p.key) {
                        <dt class="text-fg-muted">{{ p.key }}</dt>
                        <dd class="m-0 break-all">{{ p.value }}</dd>
                      }
                    </dl>
                  }
                  @if (dependsOn().length) {
                    <p class="m-0 mt-1 text-fg-soft" data-qits-derived="dependsOn">
                      Depends on: {{ dependsOn().join(', ') }}
                    </p>
                  }
                </section>
              }
            }
          }

          @if (entities().length) {
            <section>
              <h4 class="m-0 mb-1 font-semibold text-fg-soft uppercase">Entities</h4>
              <div class="flex flex-wrap gap-1">
                @for (e of entities(); track e.key) {
                  <span class="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      class="cursor-pointer rounded bg-surface-muted px-1.5 font-mono font-semibold hover:bg-surface-active"
                      [attr.data-qits-item]="marks.entity(e)"
                      data-qits-derived="entity"
                      (click)="pickEntity(e.key)"
                    >
                      {{ e.name }}
                    </button>
                    @if (project(); as slug) {
                      <a
                        class="entity-link px-0.5 text-fg-soft no-underline hover:text-fg"
                        [qitsExit]="opening.entity"
                        [exitParams]="{ slug, repo: e.repository, entity: e.entity }"
                        [attr.aria-label]="'Open ' + e.name + ' entity page'"
                        [title]="'Open ' + e.name + ' entity page'"
                        >↗</a
                      >
                    }
                  </span>
                }
              </div>
            </section>
          }

          @if (docsUrl(); as url) {
            <section>
              <h4 class="m-0 mb-1 font-semibold text-fg-soft uppercase">Docs</h4>
              <a class="docs font-semibold" [href]="url" target="_blank" rel="noopener"
                >Contracts of {{ c.provider }} in qits-docs ↗</a
              >
            </section>
          }

          @if (loaded(); as l) {
            @if (l.operation) {
              <section class="min-w-0">
                <div class="mb-1 flex items-center gap-2">
                  <h4 class="m-0 font-semibold text-fg-soft uppercase">Recorded response</h4>
                  @if (l.json) {
                    <button
                      type="button"
                      class="ml-auto cursor-pointer rounded border border-line-strong px-1.5 hover:bg-surface-subtle"
                      (click)="copy(l.json)"
                    >
                      {{ copied() ? 'Copied' : 'Copy JSON' }}
                    </button>
                  }
                </div>
                @switch (l.jsonStatus) {
                  @case ('loading') {
                    <p class="m-0 text-fg-soft">Reading…</p>
                  }
                  @case ('error') {
                    <p class="m-0 text-danger">Could not read the recorded response.</p>
                  }
                  @case ('none') {
                    <p class="m-0 text-fg-soft">The response has no JSON body.</p>
                  }
                  @case ('loaded') {
                    <pre
                      data-qits-derived="operations"
                      class="json m-0 max-h-72 overflow-auto rounded bg-surface-subtle p-2 font-mono text-[0.6875rem] leading-4"
                      >{{ preview() }}</pre>
                  }
                }
              </section>
            }
          }
        </div>
      }
    </ui-dropdown>
  `,
})
export class CallDetails {
  readonly call = input.required<FreezeRecord>();
  /** The provider's contracts site at its newest version; null when it publishes none. */
  readonly site = input<ContractsSite | null>(null);
  readonly entities = input<readonly CallEntity[]>([]);
  /** The open project's slug, for the links to the contracts and entity pages (qits-1994). */
  readonly project = input<string | null>(null);
  readonly entityPicked = output<string>();

  /**
   * The data marks of what it shows (qits-2146; `contracts-marks.ts`): the call is a record of the
   * routes manifest, the popover the provider's index and recording, the entities the entity maps,
   * all `getDocsFile` reads.
   */
  protected readonly marks = CONTRACTS_MARKS;

  private readonly origins = inject(PlatformOrigins);
  private readonly dropdown = viewChild.required(Dropdown);

  private readonly bundles = inject(ContractsBundles);

  /** Whether it opened yet: it reads nothing before. */
  private readonly opened = signal(false);

  /** The recorded state and operation, once the index is read; null when it lists no state. */
  private readonly found = computed(() => {
    const site = this.site();
    if (!this.opened() || !site) return undefined;
    const read = this.bundles.indexRead(site);
    if (!read || read.status === 'loading') return 'loading' as const;
    // An index that cannot be read lists no state, as the popover always said.
    const states = read.status === 'loaded' ? (read.index.states ?? []) : [];
    const { state, operationId } = this.call();
    const found = states.find((s) => s.name === state);
    return found
      ? {
          state: found,
          operation: found.operations.find((o) => o.operationId === operationId) ?? null,
        }
      : null;
  });

  /** What the popover has read about the call. */
  protected readonly details = computed((): Details => {
    if (!this.opened()) return { status: 'closed' };
    const site = this.site();
    const found = this.found();
    if (!site || found === null) return { status: 'none' };
    if (found === undefined || found === 'loading') return { status: 'loading' };
    const base = { status: 'loaded' as const, ...found };
    const op = found.operation;
    if (!op) return { ...base, json: null, jsonStatus: 'none' };
    // A byte answer has no file to read, and a 204's holds `null`: the popover says it could not
    // read a response, as it always did.
    if (op.file === null || op.status === 204) return { ...base, json: null, jsonStatus: 'error' };
    const read = this.bundles.recordingRead(site, op);
    if (read?.status === 'loaded') return { ...base, json: read.json, jsonStatus: 'loaded' };
    return { ...base, json: null, jsonStatus: read?.status ?? 'loading' };
  });
  protected readonly copied = signal(false);

  protected readonly loaded = computed(() => {
    const d = this.details();
    return d.status === 'loaded' ? d : null;
  });

  protected readonly opening = outcomes('open-call-contract', {
    state: exit('projects/:slug/repositories/:repo/contracts/:state'),
    entity: exit('projects/:slug/repositories/:repo/entities/:entity'),
  });

  /**
   * The exit params of the provider repository's page of the state read, when the project and the
   * site are known.
   */
  protected readonly stateParams = computed(() => {
    const slug = this.project();
    const repo = this.site()?.repository;
    const state = this.loaded()?.state.slug;
    return slug && repo && state ? { slug, repo, state } : null;
  });

  protected readonly params = computed(() =>
    Object.entries(this.loaded()?.state.params ?? {}).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    })),
  );

  protected readonly dependsOn = computed(() =>
    (this.loaded()?.state.dependsOn ?? []).map((d) =>
      typeof d === 'string' ? d : `${d.provider}: ${d.state}`,
    ),
  );

  protected readonly preview = computed(() => {
    const json = this.loaded()?.json ?? '';
    return json.length > PREVIEW_CHARS ? `${json.slice(0, PREVIEW_CHARS)}\n…` : json;
  });

  /** The service's contracts in qits-docs' reader, at the version read. */
  protected readonly docsUrl = computed(() => {
    const site = this.site();
    const origin = this.origins.page('docs');
    return site && origin ? `${origin}/read/${site.site}/-/${site.version}` : null;
  });

  constructor() {
    // The recorded response, once the index names the call's operation.
    effect(() => {
      const site = this.site();
      const found = this.found();
      const op = typeof found === 'object' ? found?.operation : null;
      if (site && op) untracked(() => this.bundles.readRecording(site, op));
    });
  }

  /** The first time it opens, it reads the golden masters. */
  protected onOpened(): void {
    if (this.opened()) return;
    this.opened.set(true);
    const site = this.site();
    if (site) this.bundles.readIndex(site);
  }

  protected pickEntity(key: string): void {
    this.dropdown().close();
    this.entityPicked.emit(key);
  }

  protected async copy(json: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(json);
      this.copied.set(true);
    } catch {
      // No clipboard (an insecure origin, a denied permission): the preview stays selectable.
    }
  }
}
