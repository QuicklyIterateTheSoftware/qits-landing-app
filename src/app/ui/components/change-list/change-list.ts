import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One changed file. */
export interface ChangeEntry {
  readonly path?: string;
  readonly oldPath?: string;
  readonly changeType?: string;
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
  A: 'text-mint-leaf-700',
  D: 'text-cinnabar-700',
  R: 'text-ocean-deep-700',
  C: 'text-ocean-deep-700',
};

/** A change type as one letter: A, M, D, R, C, or `?`. */
export function changeLetter(changeType: string | undefined): string {
  return LETTERS[changeType ?? ''] ?? (changeType ? changeType.charAt(0) : '?');
}

/**
 * A list of changed files, each with its change as a letter (A added, M modified, D deleted,
 * R renamed, C copied) and, for a rename, where it came from. A file is a button; the chosen one
 * (`selected`) is marked, and pressing one emits its path (`select`).
 */
@Component({
  selector: 'ui-change-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <ul class="m-0 flex list-none flex-col p-0" [attr.aria-label]="label()">
      @for (entry of entries(); track entry.path) {
        @let letter = letterOf(entry.changeType);
        <li>
          <button
            type="button"
            class="flex w-full cursor-pointer items-baseline gap-2 rounded px-2 py-0.5 text-left font-mono text-xs hover:bg-charcoal-brown-100"
            [class.bg-ocean-deep-50]="entry.path === selected()"
            [attr.aria-current]="entry.path === selected() ? 'true' : null"
            [title]="entry.changeType ?? ''"
            (click)="select.emit(entry.path ?? '')"
          >
            <span class="w-3 shrink-0 font-semibold" [class]="letterClass(letter)">{{
              letter
            }}</span>
            <span class="min-w-0 break-all">
              @if (entry.oldPath && entry.oldPath !== entry.path) {
                <span class="text-charcoal-brown-500">{{ entry.oldPath }} → </span>
              }
              {{ entry.path }}
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
    return LETTER_CLASSES[letter] ?? 'text-charcoal-brown-600';
  }
}
