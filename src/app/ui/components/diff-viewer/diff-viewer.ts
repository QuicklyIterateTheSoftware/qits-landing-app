import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** What a line of a unified diff is. */
export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'context';

/** One line of a unified diff. */
export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

const META_PREFIXES = [
  'diff ',
  'index ',
  'new ',
  'old ',
  'rename ',
  'copy ',
  'similarity ',
  'deleted ',
  'Binary ',
  '\\ ',
];

/** What a line of a unified diff is, by its first characters. */
export function diffLineKind(text: string): DiffLineKind {
  if (text.startsWith('@@')) return 'hunk';
  if (text.startsWith('+++') || text.startsWith('---')) return 'meta';
  if (text.startsWith('+')) return 'add';
  if (text.startsWith('-')) return 'del';
  if (META_PREFIXES.some((prefix) => text.startsWith(prefix))) return 'meta';
  return 'context';
}

/** A unified diff as lines; a trailing newline adds no empty line. */
export function diffLines(patch: string): readonly DiffLine[] {
  if (!patch) return [];
  const pieces = patch.split('\n');
  if (pieces.length > 1 && pieces[pieces.length - 1] === '') pieces.pop();
  return pieces.map((text) => ({ kind: diffLineKind(text), text }));
}

const LINE_CLASSES: Readonly<Record<DiffLineKind, string>> = {
  add: 'bg-mint-leaf-50 text-mint-leaf-900',
  del: 'bg-cinnabar-50 text-cinnabar-900',
  hunk: 'bg-ocean-deep-50 text-ocean-deep-800',
  meta: 'text-charcoal-brown-500',
  context: 'text-charcoal-brown-900',
};

/**
 * One file's unified diff, line by line, added lines green, removed red, hunk headers blue (ported
 * from `@qits/ui-components`' `qits-diff-viewer`). Without a `path` it asks for a file to be
 * chosen; an empty patch is an answer (a binary file, a pure rename, or a patch too large to send)
 * and says so.
 */
@Component({
  selector: 'ui-diff-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (!path()) {
      <p class="m-0 p-3 text-sm text-charcoal-brown-500" role="status">
        Select a changed file to view its diff.
      </p>
    } @else if (lines().length === 0) {
      <p class="m-0 p-3 text-sm text-charcoal-brown-500" role="status">
        No textual change to show — a binary file, a pure rename, or a patch too large to send.
      </p>
    } @else {
      <ol
        class="m-0 list-none overflow-x-auto rounded border border-charcoal-brown-200 p-0 font-mono text-xs leading-5"
      >
        @for (line of lines(); track $index) {
          <li class="px-2 whitespace-pre" [class]="lineClass(line.kind)">{{ line.text }}</li>
        }
      </ol>
    }
  `,
})
export class DiffViewer {
  /** The unified diff. */
  readonly patch = input('');
  /** The file it is of; empty while none is chosen. */
  readonly path = input('');

  protected readonly lines = computed(() => diffLines(this.patch()));

  protected lineClass(kind: DiffLineKind): string {
    return LINE_CLASSES[kind];
  }
}
