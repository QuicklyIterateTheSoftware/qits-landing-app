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
import { QitsEntityList, QitsField, qitsResource, sourceMark } from '@qits/angular';
import { valueMarks } from '$core/marks/value-marks';
import { PlatformOrigins } from '$core/platform/platform-origins';
import { isMissing } from '$core/resources/resource-family';
import type { FileDetection, FileListing } from '$core/workspaces/agent-files.consumes';
import {
  WORKTREE_DETECTION,
  WORKTREE_FILE,
  WORKTREE_FILES,
} from '$core/workspaces/agent-files.operations';
import { agentRoute, type AgentRoute } from '$core/workspaces/agent-proxy';
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
import { OPEN_AGENT } from '$core/workspaces/open-agent';
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

/** The tree before it is read: nothing. */
const NO_LISTING: FileListing = { paths: [], lazyDirs: [], generation: '' };

/** What one generation of the tree has gathered: opened stubs, or ignore files read, by path. */
interface ByGeneration<T> {
  readonly generation: string;
  readonly byPath: ReadonlyMap<string, T>;
}

/** `held`, with `path` set to `value`, for `generation`: a new generation starts afresh. */
function withPath<T>(
  held: ByGeneration<T>,
  generation: string,
  path: string,
  value: T,
): ByGeneration<T> {
  const byPath = held.generation === generation ? new Map(held.byPath) : new Map<string, T>();
  return { generation, byPath: byPath.set(path, value) };
}

const NOTHING_GATHERED: ByGeneration<never> = { generation: '', byPath: new Map<string, never>() };

/** A chip's button, written out in full so Tailwind finds it. */
const CHIP =
  'cursor-pointer rounded-full border px-2.5 py-0.5 font-sans text-xs aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent border-line bg-surface text-fg-soft';

/**
 * An agent's Files tab, at `/projects/<slug>/agents/<agent id>/files` (epic qits-1230; by the
 * agent's id since epic qits-1681): the agent's worktree, ported from qits-workspaces-frontend's
 * files panel. A tree on the left, the open file on the right, and the filters that decide what the
 * tree shows.
 *
 * **What it reads** (`agent-files.operations.ts`, through qits-workspaces' agent proxy, qits-2146):
 *
 * - the whole eager tree in one answer (its `qitsResource` over `WORKTREE_FILES`), with every
 *   gitignored directory as a stub, and the detection (`WORKTREE_DETECTION`): the frameworks the
 *   footer toggles and the source-to-test graph. A detection is applied only while its `generation`
 *   is the tree's, and on a mismatch the last consistent one is held;
 * - the open file (`WORKTREE_FILE`), which is the URL's `path` (and `lines`, the range painted and
 *   scrolled to), so a picked reference on the Chat tab and a pasted link open it alike;
 * - on a press, never on its own: a stub, one level, when it is opened (`WORKTREE_FILES`' `fetch`,
 *   kept until the tree's `generation` moves), and an ignore file, once, when its ignore list is
 *   first turned on (`WORKTREE_FILE`'s `fetch`).
 *
 * The slot's `files` hint (`WorkspaceHints`) reads the tree, the detection and the open file again
 * (each resource's `reload()`). The tree, the footer and the viewer name their read as their source
 * (`qitsEntityList`, qits-2141); the stub count is derived from the tree's `lazyDirs`.
 *
 * Staleness (qits-1270): no qits-events event says the worktree changed, so the `files` hint (a
 * named, lint-allowed exception) is the trigger; the agent and its slot are the layout's
 * (`OPEN_AGENT`, `WORKSPACE_EVENTS`), and a new slot moves the hint channel with it.
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
 * **Picking.** "Pick lines" arms the gutter; a picked range becomes a reference (`PickedContext`),
 * which the Chat tab's prompt composer carries in the draft.
 *
 * In the browser only: the server renders the tab without reading.
 */
@Component({
  selector: 'app-agent-files-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileFilterDialog, FileTree, FileViewer, QitsEntityList, QitsField],
  providers: [WorkspaceHints],
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3 text-sm" aria-label="Files">
      @if (agent()) {
        @if (!rowId()) {
          <p class="m-0 text-fg-soft">
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
            <section
              class="flex min-w-0 flex-col gap-2"
              aria-label="Working tree"
              [qitsEntityList]="treeRead"
            >
              <div class="flex items-center gap-2">
                <label class="sr-only" for="file-filter">Filter files by name</label>
                <input
                  id="file-filter"
                  class="min-w-0 grow rounded-md border border-line-strong bg-surface px-2 py-1 font-sans text-sm"
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
                <p class="m-0 text-xs text-fg-soft" role="status">
                  Searching: the tree is open to its full depth.
                </p>
              }
              @switch (listing().status) {
                @case ('loading') {
                  <p class="m-0 text-fg-soft" role="status">Loading files…</p>
                }
                @case ('error') {
                  <p class="m-0 flex items-center gap-3 text-danger" role="alert">
                    Could not load the working tree.
                    <button
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent underline"
                      (click)="reload()"
                    >
                      Try again
                    </button>
                  </p>
                }
              }
              @if (noMatch()) {
                <p class="m-0 text-fg-soft">No files match.</p>
              }
              @if (rows().length > 0) {
                <app-file-tree
                  [rows]="rows()"
                  [selected]="selectedPath()"
                  [loading]="pending()"
                  [marks]="treeMarks"
                  (openFile)="open($event)"
                  (toggleDir)="toggleDir($event)"
                />
              }
              @if (unsearched() > 0) {
                <p
                  class="m-0 text-xs text-fg-soft"
                  role="status"
                  [fieldOf]="shownTree()"
                  [qitsField]="{ derived: ['lazyDirs'] }"
                >
                  {{ unsearched() }} collapsed
                  {{ unsearched() === 1 ? 'directory' : 'directories' }} not searched: open to
                  include.
                </p>
              }
              @if (frameworkToggles().length > 0) {
                <footer
                  class="flex flex-wrap gap-1.5 pt-1"
                  aria-label="Detected frameworks"
                  [qitsEntityList]="detection"
                >
                  @for (framework of frameworkToggles(); track framework.frameworkId) {
                    <button
                      type="button"
                      [class]="chip"
                      [attr.aria-pressed]="activeFrameworks().has(framework.frameworkId)"
                      data-qits-derived="frameworks"
                      (click)="toggleFramework(framework.frameworkId)"
                    >
                      {{ framework.label }}
                    </button>
                  }
                </footer>
              }
            </section>

            <section
              class="flex min-w-0 flex-col gap-2"
              aria-label="File viewer"
              [qitsEntityList]="fileRead"
            >
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
                  <code class="font-mono text-xs break-all text-fg">{{ path }}</code>
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
                        class="flex items-center gap-1 rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-xs"
                      >
                        <button
                          type="button"
                          class="cursor-pointer border-0 bg-transparent p-0 font-mono text-xs text-accent"
                          (click)="show(reference)"
                        >
                          {{ rangeOf(reference) }}
                        </button>
                        <button
                          type="button"
                          class="cursor-pointer border-0 bg-transparent p-0 text-xs text-fg-muted"
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
                [marks]="fileMarks()"
                [picking]="picking()"
                [anchor]="anchor()"
                [picks]="picksHere()"
                (pick)="onPick($event)"
                (retry)="reloadFile()"
              />
            </section>
          </div>
        }
      }
    </section>
  `,
})
export class AgentFilesPage {
  private readonly openAgent = inject(OPEN_AGENT);
  private readonly origins = inject(PlatformOrigins);
  private readonly hints = inject(WorkspaceHints);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly picked = inject(PickedContext);
  protected readonly chip = CHIP;

  /** The agent's id, the agent layout's `:agentId`. */
  private readonly agentId = this.openAgent.agentId;

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  /** The agent, as the layout read it (`OPEN_AGENT`). */
  protected readonly agent = this.openAgent.agent;

  protected readonly rowId = computed(() => this.agent()?.workspaceRowId ?? 0);

  /** The open file: the URL's `path`. */
  readonly selectedPath = computed(() => this.params()?.get('path') ?? null);

  /** The URL's `lines`: painted and scrolled to. */
  protected readonly anchor = computed<LineRange | null>(() =>
    parseRange(this.params()?.get('lines')),
  );

  /** `route` of the agent proxy, for the agent in the browser once it has a slot; else nothing. */
  private at(route: AgentRoute) {
    const agentId = this.agentId();
    if (!this.browser || !agentId || !this.rowId()) return undefined;
    return { ...agentRoute(this.origins.api('workspaces'), agentId, route), path: { agentId } };
  }

  /** The whole eager tree (no `path`: a blank one would read as a directory called nothing). */
  protected readonly treeRead = qitsResource(WORKTREE_FILES, () => this.at('files'));
  /** The tree's rows are made of the listings' paths and stubs (qits-2146): marked derived. */
  protected readonly treeMarks = {
    source: sourceMark(WORKTREE_FILES),
    item: null,
    derived: 'paths lazyDirs',
  } as const;

  /** The frameworks and the source-to-test graph; a failed one only costs the footer. */
  protected readonly detection = qitsResource(WORKTREE_DETECTION, () => this.at('detection'));

  /** The open file, the URL's `path`. */
  protected readonly fileRead = qitsResource(WORKTREE_FILE, () => {
    const at = this.at('files/content');
    const path = this.selectedPath();
    return at && path ? { ...at, query: { path } } : undefined;
  });

  /** The tree as read; an empty one until it answered. */
  protected readonly shownTree = computed(
    () => (this.treeRead.hasValue() ? this.treeRead.value() : undefined) ?? NO_LISTING,
  );

  /** The tree's read: a read again that fails keeps the tree on screen. */
  protected readonly listing = computed((): ListingState => {
    if (this.treeRead.hasValue()) {
      const value = this.treeRead.value();
      if (value) return { status: 'loaded', value };
    }
    const status = this.treeRead.status();
    if (status === 'error') return { status: 'error' };
    return status === 'idle' ? { status: 'idle' } : { status: 'loading' };
  });

  /** Opened stubs, by path, for the tree's generation: a new one drops them. */
  private readonly openedStubs = signal<ByGeneration<FileListing>>(NOTHING_GATHERED);
  private readonly opened = computed((): ReadonlyMap<string, FileListing> => {
    const held = this.openedStubs();
    return held.generation === this.generation() ? held.byPath : new Map();
  });
  protected readonly pending = signal<ReadonlySet<string>>(new Set<string>());
  /** The newest detection, whatever tree it describes. */
  private readonly incoming = computed(
    (): FileDetection | null =>
      (this.detection.hasValue() ? this.detection.value() : undefined) ?? null,
  );
  /** The newest detection that matched the tree on screen. */
  private readonly held = signal<FileDetection | null>(null);

  /** What the viewer shows of the open file. */
  /** The open file's lines are cut from its `content` (qits-2146): marked derived, by its path. */
  protected readonly fileMarks = computed(() => {
    const value = this.fileRead.hasValue() ? this.fileRead.value() : undefined;
    return value ? valueMarks(WORKTREE_FILE, value, 'path', { derived: ['content'] }) : undefined;
  });

  protected readonly file = computed((): FileView | null => {
    if (!this.rowId() || !this.agentId() || !this.selectedPath()) return null;
    const read = this.fileRead;
    if (read.hasValue()) {
      const value = read.value();
      if (value) {
        return {
          status: 'loaded',
          binary: value.binary,
          content: value.binary ? null : (value.content ?? ''),
        };
      }
    }
    if (read.status() === 'error') {
      return { status: isMissing(read) ? 'missing' : 'error', binary: false, content: null };
    }
    return { status: 'loading', binary: false, content: null };
  });

  /** The name box. */
  readonly query = signal('');
  /** The framework kinds toggled on. */
  readonly activeFrameworks = signal<ReadonlySet<string>>(new Set<string>());
  /** The dialog's manual rules, in order. */
  readonly rules = signal<readonly FilterRule[]>([]);
  /** The ignore-file basenames turned on. */
  readonly activeIgnores = signal<ReadonlySet<string>>(new Set<string>());
  /** Ignore files read, by path, for the tree's generation: a new one drops them. */
  private readonly ignoreFiles = signal<ByGeneration<string>>(NOTHING_GATHERED);
  private readonly ignoreText = computed((): ReadonlyMap<string, string> => {
    const held = this.ignoreFiles();
    return held.generation === this.generation() ? held.byPath : new Map();
  });
  protected readonly dialogOpen = signal(false);
  /** Pick mode: sticky across picks, disarmed when another file opens. */
  readonly picking = signal(false);
  private readonly expanded = signal<ReadonlySet<string>>(new Set<string>());

  /** `<generation>/<path>` of the ignore files being read. */
  private readingIgnores = new Set<string>();

  constructor() {
    if (!this.browser) return;
    const fileHints = this.hints.hints('files');
    effect(() => {
      const rowId = this.rowId();
      untracked(() => this.hints.watch(rowId));
    });
    effect(() => {
      const agentId = this.agentId();
      untracked(() => this.picked.use(agentId));
    });
    // A new agent or slot is a new tree: what the old one opened, held or read goes.
    let resetFor = '';
    effect(() => {
      const key = `${this.rowId()}/${this.agentId()}`;
      untracked(() => {
        if (key === resetFor) return;
        resetFor = key;
        this.openedStubs.set(NOTHING_GATHERED);
        this.expanded.set(new Set());
        this.held.set(null);
        this.ignoreFiles.set(NOTHING_GATHERED);
        this.readingIgnores.clear();
      });
    });
    // The tree, the detection and the open file again on every `files` hint (not its first value).
    let seen = -1;
    effect(() => {
      const hint = fileHints();
      untracked(() => {
        if (seen >= 0 && hint !== seen) this.reload();
        seen = hint;
      });
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

  private readonly generation = computed(() => this.shownTree().generation);

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

  /** The tree and the detection, read again; on a hint the open file too. */
  protected reload(): void {
    if (!this.rowId() || !this.agentId()) return;
    this.treeRead.reload();
    this.detection.reload();
    this.reloadFile();
  }

  /** The open file, read again. */
  protected reloadFile(): void {
    if (this.selectedPath()) this.fileRead.reload();
  }

  // ---- reads ---------------------------------------------------------------------------------

  /** A stub, one level, on a press (`WORKTREE_FILES`' `fetch`); one that fails stays shut. */
  private async openStub(path: string): Promise<void> {
    const at = this.at('files');
    if (!at) return;
    const generation = this.generation();
    this.pending.update((pending) => new Set(pending).add(path));
    const { data, error } = await WORKTREE_FILES.fetch({ ...at, query: { path } });
    if (error === undefined && data) {
      this.openedStubs.update((held) => withPath(held, generation, path, data));
      this.expanded.update((expanded) => new Set(expanded).add(path));
    }
    this.pending.update((pending) => {
      const next = new Set(pending);
      next.delete(path);
      return next;
    });
  }

  /**
   * Each ignore file an active list needs, once per generation (`WORKTREE_FILE`'s `fetch`); one
   * that fails contributes nothing.
   */
  private readIgnoreFiles(active: ReadonlySet<string>, paths: readonly string[]): void {
    const at = this.at('files/content');
    if (!at) return;
    const generation = this.generation();
    for (const name of active) {
      for (const source of ignoreSources(paths, name)) {
        const key = `${generation}/${source.path}`;
        if (this.ignoreText().has(source.path) || this.readingIgnores.has(key)) continue;
        this.readingIgnores.add(key);
        void WORKTREE_FILE.fetch({ ...at, query: { path: source.path } }).then(
          ({ data, error }) => {
            this.readingIgnores.delete(key);
            if (error === undefined && data && !data.binary && data.content !== undefined) {
              const text = data.content;
              this.ignoreFiles.update((held) => withPath(held, generation, source.path, text));
            }
          },
        );
      }
    }
  }
}
