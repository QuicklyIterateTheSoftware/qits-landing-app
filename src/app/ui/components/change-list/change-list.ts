import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * One changed file. `path` is what is selected, emitted on click and shown in a deep link; `label`
 * is what is shown instead, defaulting to `path` (a file nested under a submodule pin shows a path
 * relative to that submodule while `path` stays the full `<gitlink>/<file>`, so selecting it still
 * reads and links the same way). `oldLabel` is the shown rename source, defaulting to `oldPath`.
 * `depth` indents the row one level per unit, default 0 (a pin's own row stays at 0; a file nested
 * under it is 1).
 */
export interface ChangeEntry {
  readonly path?: string;
  readonly oldPath?: string;
  readonly changeType?: string;
  readonly label?: string;
  readonly oldLabel?: string;
  readonly depth?: number;
}

const LETTERS: Readonly<Record<string, string>> = {
  ADD: 'A',
  ADDED: 'A',
  MODIFY: 'M',
  MODIFIED: 'M',
  DELETE: 'D',
  DELETED: 'D',
  RENAME: 'R',
  RENAMED: 'R',
  COPY: 'C',
  COPIED: 'C',
};

const LETTER_CLASSES: Readonly<Record<string, string>> = {
  A: 'text-success',
  D: 'text-danger',
  R: 'text-accent',
  C: 'text-accent',
};

/** A change type as one letter: A, M, D, R, C, or `?`. */
export function changeLetter(changeType: string | undefined): string {
  return LETTERS[changeType ?? ''] ?? (changeType ? changeType.charAt(0) : '?');
}

/**
 * A list of changed files, each with its change as a letter (A added, M modified, D deleted,
 * R renamed, C copied) and, for a rename, where it came from. A file is a button; the chosen one
 * (`selected`) is marked, and pressing one emits its path (`select`). An entry shows its `label`
 * (and `oldLabel` for a rename) instead of `path`/`oldPath` when given, and is indented one level
 * per `depth` — a file nested under a submodule pin's row, for instance — while selection and the
 * emitted value always ride `path`.
 */
@Component({
  selector: 'ui-change-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <ul class="m-0 flex list-none flex-col p-0" [attr.aria-label]="label()">
      @for (entry of entries(); track entry.path) {
        @let letter = letterOf(entry.changeType);
        @let shownOldLabel = entry.oldLabel ?? entry.oldPath;
        @let shownLabel = entry.label ?? entry.path;
        <li [attr.data-depth]="entry.depth ? entry.depth : null">
          <button
            type="button"
            class="flex w-full cursor-pointer items-baseline gap-2 rounded py-0.5 pr-2 text-left font-mono text-xs hover:bg-surface-muted"
            [class.pl-2]="!entry.depth"
            [class.pl-6]="entry.depth"
            [class.bg-accent-soft]="entry.path === selected()"
            [attr.aria-current]="entry.path === selected() ? 'true' : null"
            [title]="entry.changeType ?? ''"
            (click)="select.emit(entry.path ?? '')"
          >
            <span class="w-3 shrink-0 font-semibold" [class]="letterClass(letter)">{{
              letter
            }}</span>
            <span class="min-w-0 break-all">
              @if (shownOldLabel && shownOldLabel !== shownLabel) {
                <span class="text-fg-muted">{{ shownOldLabel }} → </span>
              }
              {{ shownLabel }}
            </span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class ChangeList {
  readonly entries = input.required<readonly ChangeEntry[]>();
  /** The chosen file's path. */
  readonly selected = input<string | null>(null);
  /** The list's accessible name. */
  readonly label = input('Changed files');
  readonly select = output<string>();

  protected readonly letterOf = changeLetter;

  protected letterClass(letter: string): string {
    return LETTER_CLASSES[letter] ?? 'text-fg-soft';
  }
}
