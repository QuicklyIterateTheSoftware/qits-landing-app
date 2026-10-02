import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One directory of a tree: a heading with a folder icon and the directory's name, and its contents
 * below, indented behind a thin guide line. Folders nest by projecting a `ui-tree-folder` into
 * another.
 *
 * ```html
 * <ui-tree-folder name="components">
 *   <ui-tree-folder name="contract">…</ui-tree-folder>
 * </ui-tree-folder>
 * ```
 *
 * Purely presentational: it knows nothing about repositories, only a name and projected content.
 * The heading is a real heading (`role="heading"`, `level` input, default 2), so a reader can jump
 * between directories.
 */
@Component({
  selector: 'ui-tree-folder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="heading"
      [attr.aria-level]="level()"
      class="flex items-center gap-2 py-1 font-mono text-sm font-semibold text-charcoal-brown-800"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        class="size-4 shrink-0 text-sunflower-gold-600"
        fill="currentColor"
      >
        <path
          d="M3 6a2 2 0 0 1 2-2h4.2a2 2 0 0 1 1.4.6L12 6h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        />
      </svg>
      {{ name() }}/
    </div>
    <div class="ml-2 border-l border-charcoal-brown-200 pl-4">
      <ng-content />
    </div>
  `,
})
export class TreeFolder {
  /** The directory's name, shown with a trailing slash. */
  readonly name = input.required<string>();

  /** The heading level, so nested folders read as nested sections. */
  readonly level = input(2);
}
