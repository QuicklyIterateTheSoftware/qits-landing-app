import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TreeRow } from '$core/workspaces/file-tree-model';

/**
 * The rows of an agent's worktree (epic qits-1230), ported from qits-workspaces-frontend's file
 * tree. It holds no state and reads nothing: what it draws was decided in `file-tree-model.ts`
 * (filtered, compacted, ordered), and what it does is an output.
 *
 * - A flat list with `aria-level`, not nested hosts, as assistive technology expects of a tree.
 * - A compacted chain (`src / main / java`) prints its folded ancestors dimmed.
 * - A gitignored row (a lazy directory, and anything under one) is dimmed, and its title says so;
 *   a stub shows its child count, and "Loading…" while it opens.
 * - A folder press never moves the selection: toggling a directory while reading a file is
 *   navigation, not a choice of file.
 */
@Component({
  selector: 'app-file-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul class="m-0 list-none p-0" role="tree" [attr.aria-label]="label()">
      @for (row of rows(); track row.node.path) {
        <li
          class="block"
          role="treeitem"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-expanded]="row.node.kind === 'file' ? null : row.open"
          [attr.aria-selected]="row.node.path === selected()"
          [style.padding-left.rem]="row.depth * 0.85"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-1 rounded border-0 px-1.5 py-0.5 text-left font-sans text-sm hover:bg-charcoal-brown-100"
            [class.bg-ocean-deep-50]="row.node.path === selected()"
            [class.font-semibold]="row.node.path === selected()"
            [class.text-ocean-deep-800]="row.node.path === selected() && !row.ignored"
            [class.text-charcoal-brown-900]="row.node.path !== selected() && !row.ignored"
            [class.text-charcoal-brown-400]="row.ignored"
            [class.bg-transparent]="row.node.path !== selected()"
            [attr.data-path]="row.node.path"
            [attr.data-kind]="row.node.kind"
            [attr.title]="titleOf(row)"
            (click)="press(row)"
          >
            @if (row.node.kind === 'file') {
              <span class="size-3 shrink-0" aria-hidden="true"></span>
            } @else {
              <svg
                viewBox="0 0 12 12"
                aria-hidden="true"
                class="size-3 shrink-0"
                [class.rotate-90]="row.open"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M4.5 2.5 8 6l-3.5 3.5" />
              </svg>
            }
            @if (row.prefix.length > 0) {
              <span class="shrink-0 text-xs text-charcoal-brown-400">
                @for (segment of row.prefix; track $index) {
                  {{ segment }}<span class="mx-0.5" aria-hidden="true">/</span>
                }
              </span>
            }
            <span class="truncate">{{ row.node.name }}</span>
            @if (row.node.kind === 'lazy') {
              <span class="text-xs text-charcoal-brown-400">({{ row.node.childCount }})</span>
            }
            @if (loading().has(row.node.path)) {
              <span class="text-xs text-charcoal-brown-500 italic">Loading…</span>
            }
          </button>
        </li>
      }
    </ul>
  `,
})
export class FileTree {
  /** The rows to draw, already filtered, compacted and ordered by the model. */
  readonly rows = input.required<readonly TreeRow[]>();

  /** The open file's path, the only row drawn as chosen. */
  readonly selected = input<string | null>(null);

  /** Lazy directories with a read in flight. */
  readonly loading = input<ReadonlySet<string>>(new Set<string>());

  /** What the tree is called, for a screen reader. */
  readonly label = input('Working tree');

  /** A file was chosen. */
  readonly openFile = output<string>();

  /** A directory row was pressed. The page decides whether that costs a read. */
  readonly toggleDir = output<TreeRow>();

  protected press(row: TreeRow): void {
    if (row.node.kind === 'file') this.openFile.emit(row.node.path);
    else this.toggleDir.emit(row);
  }

  /** The full path on hover, and whether git ignores it. */
  protected titleOf(row: TreeRow): string {
    return `${row.node.path}${row.ignored ? ' — git ignores this' : ''}`;
  }
}
