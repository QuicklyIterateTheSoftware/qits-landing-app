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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { SelectedWork } from '$core/work/selected-work';
import type { FileDetection, FileListing } from '$core/workspaces/agent-files.consumes';
import { AgentFilesStore } from '$core/workspaces/agent-files.store';
import { AgentsStore } from '$core/workspaces/agents.store';
import {
  compileAll,
  frameworkWhitelist,
  hideSet,
  previewOf,
  type CompiledRule,
  type FilterLayers,
  type FilterRule,
} from '$core/workspaces/file-filter-rules';
import { IGNORE_BASENAMES, ignoreLayer, ignoreSources } from '$core/workspaces/file-ignore-list';
import {
  formatRange,
  parseRange,
  type LineRange,
  type PickedRange,
} from '$core/workspaces/file-range';
import {
  buildGroups,
  reachableTests,
  tabLabel,
  type FileGroup,
} from '$core/workspaces/file-test-links';
import {
  applyDetection,
  buildTree,
  EMPTY_NODE,
  expandsFully,
  filePaths,
  flatten,
  frameworkSeed,
  unsearchedLazyDirs,
  visiblePaths,
  type NarrowingKind,
  type TreeRow,
} from '$core/workspaces/file-tree-model';
import { PickedContext, referenceLabel, type CodeReference } from '$core/workspaces/picked-context';
import { WorkspaceHints } from '$core/workspaces/workspace-hints';
import {
  FileFilterDialog,
  type GeneratedSet,
} from '$patterns/workspaces/file-filter-dialog/file-filter-dialog';
import { FileTree } from '$patterns/workspaces/file-tree/file-tree';
import { FileViewer, type FileView } from '$patterns/workspaces/file-viewer/file-viewer';

/** One button of the framework footer: a framework kind, however many roots declare it. */
interface FrameworkToggle {
  readonly frameworkId: string;
  readonly label: string;
}

/** The tree's read: in flight, failed, or the root listing. */
type ListingState =
  | { readonly status: 'idle' | 'loading' | 'error' }
  | { readonly status: 'loaded'; readonly value: FileListing };

/** A chip's button, written out in full so Tailwind finds it. */
const CHIP =
  'cursor-pointer rounded-full border px-2.5 py-0.5 font-sans text-xs aria-pressed:border-ocean-deep-600 aria-pressed:bg-ocean-deep-50 aria-pressed:text-ocean-deep-800 border-charcoal-brown-200 bg-white text-charcoal-brown-700';

/**
 * A work item's agent's Files tab, at `/projects/<slug>/work/detail/<qualified id>/agent/files`
 * (epic qits-1230): the agent's worktree, ported from qits-workspaces-frontend's files panel. A
 * tree on the left, the open file on the right, and the filters that decide what the tree shows.
 *
 * **What it reads** (`AgentFilesStore`, through qits-workspaces' container proxy):
 *
 * - the whole eager tree in one answer (`list`), with every gitignored directory as a stub, and
 *   the detection (`detect`): the frameworks the footer toggles and the source-to-test graph. A
 *   detection is applied only while its `generation` is the tree's, and on a mismatch the last
 *   consistent one is held;
 * - a stub, one level, when it is opened (cached until the tree's `generation` moves);
 * - the open file (`read`), which is the URL's `path` (and `lines`, the range painted and scrolled
 *   to), so a picked reference on the Chat tab and a pasted link open it alike;
 * - an ignore file, once, when its ignore list is first turned on.
 *
 * The slot's `files` hint (`WorkspaceHints`) reads the tree, the detection and the open file again.
 *
 * Staleness (qits-1270): no qits-events event says the worktree changed, so the `files` hint (a
 * named, lint-allowed exception) is the trigger; the agent and its slot are the layout's
 * (`AgentsStore.loadItem`, `WORKSPACE_EVENTS`), and a new slot moves the hint channel with it.
 *
 * **What the tree shows.** A gitignored directory is a dimmed stub with its child count. A name
 * search (fuzzy, a glob with `*`, or a path with `/`) or a manual rule opens the tree fully; a
 * framework toggle narrows it to the framework's member paths and opens it to a framework-sensible
 * depth. The rules run framework → ignore list → manual, last match wins, so a manual `show` can
 * bring back what the others hid (`file-filter-rules.ts`). An ignore list (`.gitignore`,
 * `.dockerignore`) hides what the tree's own ignore files name, each scoped to its directory. A
 * test one link away from its source is hidden from the tree (except while searching), and the
 * viewer's strip links a source and its tests both ways.
 *
 * **Picking.** "Pick lines" arms the gutter; a picked range becomes a reference
 * (`PickedContext`), which the Chat tab's prompt composer carries in the draft.
 *
 * In the browser only: the server renders the tab without reading.
 */
@Component({
  selector: 'app-agent-files-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileFilterDialog, FileTree, FileViewer],
  providers: [WorkspaceHints],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3 text-sm" aria-label="Files">
      @if (agent()) {
        @if (!rowId()) {
          <p class="m-0 text-charcoal-brown-600">
            This agent has no workspace yet, so there is no worktree to show.
          </p>
        } @else {
          @if (dialogOpen()) {
            <app-file-filter-dialog
              [rules]="rules()"
              [frameworkSets]="frameworkSets()"
              [ignoreSets]="ignoreSets()"
              [preview]="preview()"
              (rulesChange)="rules.set($event)"
              (toggleFramework)="toggleFramework($event)"
              (toggleIgnore)="toggleIgnore($event)"
              (closed)="dialogOpen.set(false)"
            />
          }
          <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
            <section class="flex min-w-0 flex-col gap-2" aria-label="Working tree">
              <div class="flex items-center gap-2">
                <label class="sr-only" for="file-filter">Filter files by name</label>
                <input
                  id="file-filter"
                  class="min-w-0 grow rounded-md border border-charcoal-brown-300 bg-white px-2 py-1 font-sans text-sm"
                  type="search"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Filter: fuzzy, or a glob like *.ts"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                />
                <button
                  type="button"
                  [class]="chip"
                  [attr.aria-pressed]="rules().length > 0 || activeIgnores().size > 0"
                  [attr.aria-expanded]="dialogOpen()"
                  (click)="dialogOpen.set(!dialogOpen())"
                >
                  Filters
                  @if (rules().length > 0) {
                    <span class="font-semibold">{{ rules().length }}</span>
                  }
                </button>
              </div>
              @if (fullyExpanded()) {
                <p class="m-0 text-xs text-charcoal-brown-600" role="status">
                  Searching: the tree is open to its full depth.
                </p>
              }
              @switch (listing().status) {
                @case ('loading') {
                  <p class="m-0 text-charcoal-brown-600" role="status">Loading files…</p>
                }
                @case ('error') {
                  <p class="m-0 flex items-center gap-3 text-cinnabar-700" role="alert">
                    Could not load the working tree.
                    <button
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
                      (click)="reload()"
                    >
                      Try again
                    </button>
                  </p>
                }
              }
              @if (noMatch()) {
                <p class="m-0 text-charcoal-brown-600">No files match.</p>
              }
              @if (rows().length > 0) {
                <app-file-tree
                  [rows]="rows()"
                  [selected]="selectedPath()"
                  [loading]="pending()"
                  (openFile)="open($event)"
                  (toggleDir)="toggleDir($event)"
                />
              }
              @if (unsearched() > 0) {
                <p class="m-0 text-xs text-charcoal-brown-600" role="status">
                  {{ unsearched() }} collapsed
                  {{ unsearched() === 1 ? 'directory' : 'directories' }} not searched: open to
                  include.
                </p>
              }
              @if (frameworkToggles().length > 0) {
                <footer class="flex flex-wrap gap-1.5 pt-1" aria-label="Detected frameworks">
                  @for (framework of frameworkToggles(); track framework.frameworkId) {
                    <button
                      type="button"
                      [class]="chip"
                      [attr.aria-pressed]="activeFrameworks().has(framework.frameworkId)"
                      (click)="toggleFramework(framework.frameworkId)"
                    >
                      {{ framework.label }}
                    </button>
                  }
                </footer>
              }
            </section>

            <section class="flex min-w-0 flex-col gap-2" aria-label="File viewer">
              @if (selectedPath(); as path) {
                @if (group(); as strip) {
                  <nav class="flex flex-wrap gap-1.5" aria-label="Source and its tests">
                    <button
                      type="button"
                      [class]="chip"
                      [attr.aria-pressed]="path === strip.source"
                      [attr.title]="strip.source"
                      (click)="open(strip.source)"
                    >
                      Code
                    </button>
                    @for (test of strip.tests; track test) {
                      <button
                        type="button"
                        [class]="chip"
                        [attr.aria-pressed]="path === test"
                        [attr.title]="test"
                        (click)="open(test)"
                      >
                        {{ testLabel(test) }}
                      </button>
                    }
                  </nav>
                }
                <header class="flex flex-wrap items-center justify-between gap-2">
                  <code class="font-mono text-xs break-all text-charcoal-brown-800">{{
                    path
                  }}</code>
                  <button
                    type="button"
                    [class]="chip"
                    [attr.aria-pressed]="picking()"
                    (click)="picking.set(!picking())"
                  >
                    {{ picking() ? 'Picking: press two line numbers' : 'Pick lines' }}
                  </button>
                </header>
                @if (picksHere().length > 0) {
                  <ul
                    class="m-0 flex list-none flex-wrap gap-1.5 p-0"
                    aria-label="Picked line ranges"
                  >
                    @for (reference of picksHere(); track label(reference)) {
                      <li
                        class="flex items-center gap-1 rounded-full border border-ocean-deep-200 bg-ocean-deep-50 px-2 py-0.5 text-xs"
                      >
                        <button
                          type="button"
                          class="cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-ocean-deep-800"
                          (click)="show(reference)"
                        >
                          {{ rangeOf(reference) }}
                        </button>
                        <button
                          type="button"
                          class="cursor-pointer border-0 bg-transparent p-0 text-xs text-charcoal-brown-500"
                          [attr.aria-label]="'Remove ' + label(reference)"
                          (click)="picked.remove(label(reference))"
                        >
                          ✕
                        </button>
                      </li>
                    }
                  </ul>
                }
              }
              <app-file-viewer
                [path]="selectedPath()"
                [file]="file()"
                [picking]="picking()"
                [anchor]="anchor()"
                [picks]="picksHere()"
                (pick)="onPick($event)"
                (retry)="readFile()"
              />
            </section>
          </div>
        }
      }
    </section>
  `,
})
export class AgentFilesPage {
  private readonly work = inject(SelectedWork);
  private readonly agents = inject(AgentsStore);
  private readonly files = inject(AgentFilesStore);
  private readonly hints = inject(WorkspaceHints);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly picked = inject(PickedContext);
  protected readonly chip = CHIP;

  /** The work item's qualified id, the agent layout's `:id`. */
  private readonly id = toSignal(
    (this.route.parent ?? this.route).paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  private readonly workId = computed(
    () => this.work.entries().find((e) => e.qualifiedId === this.id())?.id,
  );

  protected readonly agent = computed(() => {
    const id = this.workId();
    return id ? this.agents.itemOf(id)?.agent : undefined;
  });

  protected readonly rowId = computed(() => this.agent()?.workspaceRowId ?? 0);
  private readonly agentId = computed(() => this.agent()?.agentId ?? '');

  /** The open file: the URL's `path`. */
  readonly selectedPath = computed(() => this.params()?.get('path') ?? null);

  /** The URL's `lines`: painted and scrolled to. */
  protected readonly anchor = computed<LineRange | null>(() =>
    parseRange(this.params()?.get('lines')),
  );

  protected readonly listing = signal<ListingState>({ status: 'idle' });
  /** Opened stubs, by path; dropped when the tree's generation moves. */
  private readonly opened = signal<ReadonlyMap<string, FileListing>>(new Map());
  protected readonly pending = signal<ReadonlySet<string>>(new Set<string>());
  /** The newest detection, whatever tree it describes. */
  private readonly incoming = signal<FileDetection | null>(null);
  /** The newest detection that matched the tree on screen. */
  private readonly held = signal<FileDetection | null>(null);
  protected readonly file = signal<FileView | null>(null);

  /** The name box. */
  readonly query = signal('');
  /** The framework kinds toggled on. */
  readonly activeFrameworks = signal<ReadonlySet<string>>(new Set<string>());
  /** The dialog's manual rules, in order. */
  readonly rules = signal<readonly FilterRule[]>([]);
  /** The ignore-file basenames turned on. */
  readonly activeIgnores = signal<ReadonlySet<string>>(new Set<string>());
  /** Ignore files read, by path. */
  private readonly ignoreText = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly dialogOpen = signal(false);
  /** Pick mode: sticky across picks, disarmed when another file opens. */
  readonly picking = signal(false);
  private readonly expanded = signal<ReadonlySet<string>>(new Set<string>());

  private readingIgnores = new Set<string>();
  /** The path `file` is about. */
  private fileFor: string | null = null;
  /** `<slot row id>/<agent id>` the tree was reset for. */
  private resetFor: string | null = null;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const fileHints = this.hints.hints('files');
    effect(() => {
      const rowId = this.rowId();
      untracked(() => this.hints.watch(rowId));
    });
    effect(() => {
      const agentId = this.agentId();
      untracked(() => this.picked.use(agentId));
    });
    // The tree and the detection: on the agent, and again on every `files` hint.
    effect(() => {
      const rowId = this.rowId();
      const agentId = this.agentId();
      fileHints();
      untracked(() => this.load(rowId, agentId));
    });
    // The open file: on the URL, and again on every `files` hint.
    effect(() => {
      const rowId = this.rowId();
      const agentId = this.agentId();
      const path = this.selectedPath();
      fileHints();
      untracked(() => void this.readFile(rowId, agentId, path));
    });
    // The generation gate: written, because holding the last consistent answer is state.
    effect(() => {
      const incoming = this.incoming();
      const generation = this.generation();
      untracked(() => this.held.set(applyDetection(this.held(), incoming, generation)));
    });
    // The ignore files, read when a list is turned on; a later `.gitignore` is one too.
    effect(() => {
      const active = this.activeIgnores();
      const paths = this.allPaths();
      untracked(() => this.readIgnoreFiles(active, paths));
    });
    effect(() => {
      this.selectedPath();
      untracked(() => this.picking.set(false));
    });
  }

  // ---- what is on screen ---------------------------------------------------------------------

  private readonly generation = computed(() => {
    const state = this.listing();
    return state.status === 'loaded' ? state.value.generation : '';
  });

  private readonly tree = computed(() => {
    const state = this.listing();
    return state.status === 'loaded' ? buildTree(state.value, this.opened()) : EMPTY_NODE;
  });

  private readonly allPaths = computed(() => filePaths(this.tree()));
  private readonly openedPaths = computed<ReadonlySet<string>>(() => new Set(this.opened().keys()));
  private readonly manualRules = computed(() => compileAll(this.rules()));

  /** Why the tree is narrowed, which decides how far it opens. */
  private readonly narrowing = computed<readonly NarrowingKind[]>(() => {
    const kinds: NarrowingKind[] = [];
    if (this.query().trim() !== '') kinds.push('name-search');
    if (this.manualRules().length > 0) kinds.push('manual-rule');
    if (this.activeFrameworks().size > 0) kinds.push('framework');
    return kinds;
  });

  /** A search (the name box or a manual rule) opens the tree fully. */
  readonly fullyExpanded = computed(() => expandsFully(this.narrowing()));

  protected readonly frameworkToggles = computed<readonly FrameworkToggle[]>(() => {
    const seen = new Map<string, FrameworkToggle>();
    for (const { frameworkId, label } of this.held()?.frameworks ?? []) {
      if (!seen.has(frameworkId)) seen.set(frameworkId, { frameworkId, label });
    }
    return [...seen.values()];
  });

  private readonly groups = computed<ReadonlyMap<string, FileGroup>>(() =>
    buildGroups(this.held()?.links ?? []),
  );

  /** The strip above the viewer: Code, then one link per test. */
  protected readonly group = computed<FileGroup | null>(() => {
    const path = this.selectedPath();
    return path ? (this.groups().get(path) ?? null) : null;
  });

  /** Tests one link from their source leave the tree, except while the name box is used. */
  private readonly hiddenTests = computed<readonly CompiledRule[]>(() => {
    if (this.query().trim() !== '') return [];
    const tests = reachableTests(this.held()?.links ?? []);
    return tests.size === 0 ? [] : [hideSet(tests, 'hide · tests reachable from their source')];
  });

  private readonly ignoreRules = computed<readonly CompiledRule[]>(() =>
    [...this.activeIgnores()].flatMap((name) =>
      ignoreLayer(ignoreSources(this.allPaths(), name), this.ignoreText()),
    ),
  );

  /** The three layers, in the one order they are evaluated in. */
  readonly layers = computed<FilterLayers>(() => {
    const active = this.activeFrameworks();
    const framework = (this.held()?.frameworks ?? [])
      .filter((membership) => active.has(membership.frameworkId))
      .map((membership) => frameworkWhitelist(new Set(membership.memberPaths), membership.label));
    return {
      defaultHidden: active.size > 0,
      framework,
      ignoreList: [...this.ignoreRules(), ...this.hiddenTests()],
      manual: this.manualRules(),
    };
  });

  private readonly matched = computed(() =>
    visiblePaths(this.allPaths(), this.query(), this.layers()),
  );

  protected readonly rows = computed<readonly TreeRow[]>(() =>
    flatten(this.tree(), {
      expanded: this.expanded(),
      fullyExpanded: this.fullyExpanded(),
      visible: this.matched(),
      opened: this.openedPaths(),
    }),
  );

  protected readonly preview = computed(() =>
    previewOf(this.allPaths(), this.layers(), this.query()),
  );

  /** The dialog's framework rows: one per kind, as the footer. */
  protected readonly frameworkSets = computed<readonly GeneratedSet[]>(() => {
    const byKind = new Map<string, { label: string; roots: string[]; members: number }>();
    for (const membership of this.held()?.frameworks ?? []) {
      const entry = byKind.get(membership.frameworkId) ?? {
        label: membership.label,
        roots: [],
        members: 0,
      };
      entry.roots.push(membership.root || 'the root');
      entry.members += membership.memberPaths.length;
      byKind.set(membership.frameworkId, entry);
    }
    return [...byKind.entries()].map(([id, entry]) => ({
      id,
      name: entry.label,
      on: this.activeFrameworks().has(id),
      note: `${entry.members} paths under ${entry.roots.join(', ')}`,
      rules: [`show · whitelist of ${entry.members} server-resolved member paths`],
    }));
  });

  /** The dialog's ignore-list rows: a basename with no file in the tree is left out, unless on. */
  protected readonly ignoreSets = computed<readonly GeneratedSet[]>(() =>
    IGNORE_BASENAMES.map((name) => {
      const sources = ignoreSources(this.allPaths(), name);
      const on = this.activeIgnores().has(name);
      return {
        id: name,
        name,
        on,
        count: sources.length,
        note: `${sources.length} ${sources.length === 1 ? 'file' : 'files'} in the tree`,
        rules: on
          ? ignoreLayer(sources, this.ignoreText()).map((rule) => `${rule.mode} · ${rule.label}`)
          : [],
      };
    }).filter((set) => set.count > 0 || set.on),
  );

  /** The ranges picked in the open file. */
  protected readonly picksHere = computed<readonly CodeReference[]>(() => {
    const path = this.selectedPath();
    return path ? this.picked.references().filter((reference) => reference.path === path) : [];
  });

  /** Stubs the filter could not look inside; said only while something narrows. */
  protected readonly unsearched = computed(() =>
    this.narrowing().length === 0 ? 0 : unsearchedLazyDirs(this.tree(), this.openedPaths()),
  );

  /** Nothing matched, said about files, not rows: an unopened stub stays visible under a filter. */
  protected readonly noMatch = computed(() => {
    if (this.listing().status !== 'loaded') return false;
    const matched = this.matched();
    return matched === null ? this.allPaths().length === 0 : matched.size === 0;
  });

  protected label(reference: CodeReference): string {
    return referenceLabel(reference);
  }

  protected rangeOf(reference: CodeReference): string {
    return formatRange(reference);
  }

  protected testLabel(path: string): string {
    return tabLabel(path);
  }

  // ---- what the tab does ---------------------------------------------------------------------

  /** Open a file: it goes in the URL, which is what reads it. */
  protected open(path: string, range: LineRange | null = null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { path, lines: range ? formatRange(range) : null },
      queryParamsHandling: 'merge',
    });
  }

  /** Jump to a picked range. */
  protected show(reference: CodeReference): void {
    this.open(reference.path, reference);
  }

  /** A directory row: an unopened stub costs a read; anything else is free. */
  protected toggleDir(row: TreeRow): void {
    const node = row.node;
    if (node.kind === 'lazy' && !this.openedPaths().has(node.path)) {
      void this.openStub(node.path);
      return;
    }
    // A search opened the tree; collapsing one row would argue with it.
    if (this.fullyExpanded() && node.kind !== 'lazy') return;
    const paths = row.chain.length > 0 ? row.chain : [node.path];
    this.expanded.update((expanded) => {
      const next = new Set(expanded);
      for (const path of paths) {
        if (row.open) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  }

  /**
   * Toggle one framework kind. On, it narrows the tree and opens it at the framework's root and
   * the unambiguous run beneath; that opening stays when the toggle goes off again.
   */
  toggleFramework(frameworkId: string): void {
    const active = new Set(this.activeFrameworks());
    if (active.has(frameworkId)) {
      active.delete(frameworkId);
      this.activeFrameworks.set(active);
      return;
    }
    active.add(frameworkId);
    this.activeFrameworks.set(active);
    const tree = this.tree();
    const seeded = new Set(this.expanded());
    for (const membership of this.held()?.frameworks ?? []) {
      if (membership.frameworkId !== frameworkId) continue;
      for (const path of frameworkSeed(tree, membership.root, new Set(membership.memberPaths))) {
        seeded.add(path);
      }
    }
    this.expanded.set(seeded);
  }

  toggleIgnore(name: string): void {
    this.activeIgnores.update((active) => {
      const next = new Set(active);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  /** A range was picked: it becomes a reference the prompt can carry. */
  protected onPick(range: PickedRange): void {
    const path = this.selectedPath();
    if (path) this.picked.add({ path, ...range });
  }

  protected reload(): void {
    this.load(this.rowId(), this.agentId());
  }

  // ---- reads ---------------------------------------------------------------------------------

  /** The tree and the detection, read together; a failed detection only costs the footer. */
  private load(rowId: number, agentId: string): void {
    if (!rowId || !agentId) return;
    const key = `${rowId}/${agentId}`;
    if (this.resetFor !== key) {
      this.resetFor = key;
      this.opened.set(new Map());
      this.expanded.set(new Set());
      this.held.set(null);
      this.incoming.set(null);
      this.ignoreText.set(new Map());
      this.readingIgnores.clear();
      this.listing.set({ status: 'loading' });
    }
    void this.files.detect(rowId, agentId).then((outcome) => {
      if (outcome.ok && this.resetFor === key) this.incoming.set(outcome.value);
    });
    void this.files.list(rowId, agentId).then((outcome) => {
      if (this.resetFor !== key) return;
      if (!outcome.ok) {
        // A read again that fails keeps the tree on screen.
        if (this.listing().status !== 'loaded') this.listing.set({ status: 'error' });
        return;
      }
      // Opened stubs and ignore files describe one generation; a new one drops them.
      if (this.generation() !== outcome.value.generation) {
        this.opened.set(new Map());
        this.ignoreText.set(new Map());
        this.readingIgnores.clear();
      }
      this.listing.set({ status: 'loaded', value: outcome.value });
    });
  }

  private async openStub(path: string): Promise<void> {
    const rowId = this.rowId();
    const agentId = this.agentId();
    this.pending.update((pending) => new Set(pending).add(path));
    const outcome = await this.files.list(rowId, agentId, path);
    // A directory that will not open stays shut.
    if (outcome.ok) {
      this.opened.update((opened) => new Map(opened).set(path, outcome.value));
      this.expanded.update((expanded) => new Set(expanded).add(path));
    }
    this.pending.update((pending) => {
      const next = new Set(pending);
      next.delete(path);
      return next;
    });
  }

  /** The open file; a late answer for a file nobody reads any more is dropped. */
  protected async readFile(
    rowId = this.rowId(),
    agentId = this.agentId(),
    path = this.selectedPath(),
  ): Promise<void> {
    if (!rowId || !agentId || !path) {
      this.file.set(null);
      return;
    }
    // A read again of the same file keeps its text on screen until the answer.
    if (this.fileFor !== path || this.file()?.status !== 'loaded') {
      this.file.set({ status: 'loading', binary: false, content: null });
    }
    this.fileFor = path;
    const outcome = await this.files.read(rowId, agentId, path);
    if (this.selectedPath() !== path) return;
    if (outcome.ok) {
      this.file.set({
        status: 'loaded',
        binary: outcome.value.binary,
        content: outcome.value.binary ? null : (outcome.value.content ?? ''),
      });
    } else {
      this.file.set({
        status: outcome.status === 404 ? 'missing' : 'error',
        binary: false,
        content: null,
      });
    }
  }

  /** Each ignore file an active list needs, once; one that fails contributes nothing. */
  private readIgnoreFiles(active: ReadonlySet<string>, paths: readonly string[]): void {
    const rowId = this.rowId();
    const agentId = this.agentId();
    if (!rowId || !agentId) return;
    for (const name of active) {
      for (const source of ignoreSources(paths, name)) {
        if (this.ignoreText().has(source.path) || this.readingIgnores.has(source.path)) continue;
        this.readingIgnores.add(source.path);
        void this.files.read(rowId, agentId, source.path).then((outcome) => {
          this.readingIgnores.delete(source.path);
          if (outcome.ok && !outcome.value.binary && outcome.value.content !== undefined) {
            const text = outcome.value.content;
            this.ignoreText.update((known) => new Map(known).set(source.path, text));
          }
        });
      }
    }
  }
}
