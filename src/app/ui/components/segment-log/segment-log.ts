import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChildren,
} from '@angular/core';

/** One stage of a log: its key, what its head says, how it went, and its lines. */
export interface LogSegment {
  /** The segment's key; unique in the log. */
  readonly name: string;
  /** What its head says. */
  readonly label: string;
  readonly status: 'running' | 'ok' | 'failed';
  /** What its badge says (`running`, `waiting`, `ok`, `failed`). */
  readonly badge: string;
  readonly lines: readonly string[];
  /** A sentence below it, such as why it failed; none when empty. */
  readonly note?: string;
}

/** A badge's colours per status, written out in full so Tailwind finds them. */
const BADGES: Readonly<Record<LogSegment['status'], string>> = {
  running: 'bg-ocean-deep-100 text-ocean-deep-800',
  ok: 'bg-mint-leaf-100 text-mint-leaf-800',
  failed: 'bg-cinnabar-100 text-cinnabar-700',
};

/**
 * A log in named segments, one expander each, as a long operation streams it (a container start):
 * a running segment is open and a settled one collapses to its head, unless it was opened or
 * closed by hand, which then holds for that segment; an open body follows its newest line. `lede`
 * is a sentence above the segments; `waiting` shows while there is no segment yet.
 */
@Component({
  selector: 'ui-segment-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <p class="m-0 mb-2 text-sm text-charcoal-brown-600">{{ lede() }}</p>
    <p
      class="m-0 text-sm text-charcoal-brown-500 italic"
      [class.hidden]="segments().length || !waiting()"
    >
      Waiting for the first line…
    </p>
    <ol class="m-0 list-none p-0">
      @for (segment of segments(); track segment.name) {
        <li class="border-t border-charcoal-brown-200">
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-0 py-1.5 text-left text-sm text-charcoal-brown-900"
            [attr.aria-expanded]="isOpen(segment)"
            (click)="toggle(segment)"
          >
            <span
              aria-hidden="true"
              class="size-0 shrink-0 border-y-[0.32rem] border-l-[0.42rem] border-y-transparent border-l-charcoal-brown-500"
              [class.rotate-90]="isOpen(segment)"
            ></span>
            <span class="min-w-0 flex-1 wrap-anywhere">{{ segment.label }}</span>
            <span
              class="shrink-0 rounded-full px-2 text-xs leading-5"
              [class]="badgeClass(segment)"
              >{{ segment.badge }}</span
            >
          </button>
          @if (isOpen(segment)) {
            <pre
              #body
              class="m-0 mb-2 ml-3.5 max-h-72 overflow-auto rounded bg-charcoal-brown-950 px-2.5 py-1.5 font-mono text-xs whitespace-pre-wrap text-charcoal-brown-100"
              >{{ segment.lines.join('\\n') }}</pre>
          }
          @if (segment.note) {
            <p class="m-0 mb-2 ml-3.5 text-sm text-cinnabar-700">{{ segment.note }}</p>
          }
        </li>
      }
    </ol>
  `,
})
export class SegmentLog {
  readonly segments = input.required<readonly LogSegment[]>();
  readonly lede = input('');
  /** Whether the log is still coming: "Waiting for the first line…" while it has none. */
  readonly waiting = input(true);

  /** Segments opened or closed by hand; such an entry holds over the default for good. */
  private readonly manual = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly bodies = viewChildren<ElementRef<HTMLElement>>('body');

  constructor() {
    // After the render that added the line: the height it scrolls to is the one the line made.
    afterRenderEffect(() => {
      this.segments();
      for (const body of this.bodies()) {
        body.nativeElement.scrollTop = body.nativeElement.scrollHeight;
      }
    });
  }

  protected isOpen(segment: LogSegment): boolean {
    return this.manual().get(segment.name) ?? segment.status === 'running';
  }

  protected toggle(segment: LogSegment): void {
    const open = this.isOpen(segment);
    this.manual.update((manual) => new Map(manual).set(segment.name, !open));
  }

  protected badgeClass(segment: LogSegment): string {
    return BADGES[segment.status];
  }
}
