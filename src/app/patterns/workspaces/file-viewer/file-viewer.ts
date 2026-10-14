import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import type { LineRange, PickedRange } from '$core/workspaces/file-range';

/**
 * One open file, as the Files tab read it: `loading`, `loaded` (its text, or `binary` without
 * one), `missing` (the path names nothing: a 404), or `error` (the daemon did not answer).
 */
export interface FileView {
  readonly status: 'loading' | 'loaded' | 'missing' | 'error';
  readonly binary: boolean;
  /** The text; `null` while there is none (binary, or not loaded). */
  readonly content: string | null;
}

/** One drawn line: its number and its text. */
interface ViewerLine {
  readonly number: number;
  readonly text: string;
}

/**
 * The read-only file viewer of an agent's Files tab (epic qits-1230), ported from
 * qits-workspaces-frontend's: line numbers, the anchored range painted and scrolled to, the picked
 * ranges painted, and picking. No syntax highlighting, as there.
 *
 * - **Binary or too large.** The daemon answers `binary: true` both for a binary file and for one
 *   over its 2 MB cap, and publishes no size, so the viewer says "too large or binary" and why.
 * - **Picking.** While `picking`, the line numbers are buttons: two presses make a range (one line
 *   pressed twice is a range of one), a shift-press makes one from the first end; the range goes
 *   out as `pick` with its lines' text captured now. Another file drops a half-made range.
 *
 * It reads nothing: the page loads the file and hands it over as `file`.
 */
@Component({
  selector: 'app-file-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    @if (!path()) {
      <p class="m-0 text-sm text-charcoal-brown-600">Select a file to view its contents.</p>
    } @else {
      @switch (file()?.status) {
        @case ('loading') {
          <p class="m-0 text-sm text-charcoal-brown-600" role="status">Loading {{ path() }}…</p>
        }
        @case ('missing') {
          <p class="m-0 text-sm text-charcoal-brown-600" role="status">
            {{ path() }} is not in the worktree (any more).
          </p>
        }
        @case ('error') {
          <p class="m-0 flex items-center gap-3 text-sm text-cinnabar-700" role="alert">
            Could not read {{ path() }}.
            <button
              type="button"
              class="cursor-pointer border-0 bg-transparent p-0 text-sm text-ocean-deep-700 underline"
              (click)="retry.emit()"
            >
              Try again
            </button>
          </p>
        }
        @case ('loaded') {
          @if (file()?.binary) {
            <p class="m-0 text-sm text-charcoal-brown-600" role="status">
              This file is too large or binary: the workspace sends both the same way, so this page
              cannot tell which. The read limit is 2 MB.
            </p>
          } @else if (lines().length === 0) {
            <p class="m-0 text-sm text-charcoal-brown-600" role="status">This file is empty.</p>
          } @else {
            <div
              class="max-h-[34rem] overflow-auto rounded-md border border-charcoal-brown-200 bg-white"
            >
              <ol class="m-0 list-none py-1.5 pl-0 font-mono text-xs leading-normal">
                @for (line of lines(); track line.number) {
                  <li
                    class="flex items-start gap-2.5 px-2"
                    [class.bg-sunflower-gold-100]="isAnchored(line.number)"
                    [class.bg-ocean-deep-50]="!isAnchored(line.number) && isPicked(line.number)"
                    [class.outline-dashed]="line.number === pendingFrom()"
                    [class.outline-1]="line.number === pendingFrom()"
                    [class.outline-ocean-deep-600]="line.number === pendingFrom()"
                    [attr.data-line]="line.number"
                  >
                    @if (picking()) {
                      <button
                        type="button"
                        class="w-10 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-xs text-ocean-deep-700 select-none hover:underline"
                        [attr.aria-label]="'Pick from line ' + line.number"
                        (click)="onGutter(line.number, $event)"
                      >
                        {{ line.number }}
                      </button>
                    } @else {
                      <span
                        class="w-10 shrink-0 text-right text-charcoal-brown-400 select-none"
                        aria-hidden="true"
                        >{{ line.number }}</span
                      >
                    }
                    <code class="grow whitespace-pre text-charcoal-brown-900">{{ line.text }}</code>
                  </li>
                }
              </ol>
            </div>
          }
        }
      }
    }
  `,
})
export class FileViewer {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The open file's path, or null for the empty state. */
  readonly path = input<string | null>(null);

  /** The open file as read. */
  readonly file = input<FileView | null>(null);

  /** Whether pick mode is armed. */
  readonly picking = input(false);

  /** The deep link's range: painted and scrolled to. */
  readonly anchor = input<LineRange | null>(null);

  /** The ranges already picked in this file, painted. */
  readonly picks = input<readonly LineRange[]>([]);

  /** A range was picked. */
  readonly pick = output<PickedRange>();

  /** The read failed; read again. */
  readonly retry = output<void>();

  /** The first end of a range in progress; null: the next press starts one. */
  protected readonly pendingFrom = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.path();
      untracked(() => this.pendingFrom.set(null));
    });
    // On the content, not the anchor alone: an anchor that comes before the file has nothing to
    // scroll to, and both orders happen.
    effect(() => {
      const lines = this.lines();
      const anchor = this.anchor();
      if (this.browser && lines.length > 0 && anchor) {
        untracked(() => queueMicrotask(() => this.scrollTo(anchor.startLine)));
      }
    });
  }

  /** The lines to draw; a trailing newline adds none. */
  protected readonly lines = computed<readonly ViewerLine[]>(() => {
    const file = this.file();
    if (file?.status !== 'loaded' || file.binary || !file.content) return [];
    const pieces = file.content.split('\n');
    if (pieces.length > 1 && pieces[pieces.length - 1] === '') pieces.pop();
    return pieces.map((text, at) => ({ number: at + 1, text }));
  });

  protected isAnchored(line: number): boolean {
    const anchor = this.anchor();
    return anchor !== null && line >= anchor.startLine && line <= anchor.endLine;
  }

  protected isPicked(line: number): boolean {
    return this.picks().some((range) => line >= range.startLine && line <= range.endLine);
  }

  protected onGutter(line: number, event: MouseEvent): void {
    const from = this.pendingFrom();
    if (from === null && !event.shiftKey) {
      this.pendingFrom.set(line);
      return;
    }
    const start = Math.min(from ?? line, line);
    const end = Math.max(from ?? line, line);
    this.pendingFrom.set(null);
    const excerpt = this.lines()
      .slice(start - 1, end)
      .map((entry) => entry.text)
      .join('\n');
    this.pick.emit({ startLine: start, endLine: end, excerpt });
  }

  private scrollTo(line: number): void {
    const element = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-line="${line}"]`,
    );
    // jsdom has no layout and no scrollIntoView.
    element?.scrollIntoView?.({ block: 'center' });
  }
}
