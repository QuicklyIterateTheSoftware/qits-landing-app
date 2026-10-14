import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { FitAddon } from '@xterm/addon-fit';
import type { IDisposable, Terminal } from '@xterm/xterm';

/** Raw terminal frames: a new generation clears the screen, then its chunks are written in order. */
export interface ScreenFrames {
  readonly generation: number;
  readonly chunks: readonly string[];
}

/** The terminal's size in cells. */
export interface ScreenSize {
  readonly cols: number;
  readonly rows: number;
}

/**
 * A terminal screen (xterm.js) over a stream of raw frames, ported from qits-workspaces-frontend's
 * terminal view (epic qits-1230). It knows nothing about sockets: `frames` in, keystrokes (`data`)
 * and its size in cells (`resized`) out.
 *
 * xterm.js is loaded lazily, in the browser only (`afterNextRender`), and only where `matchMedia`
 * exists (xterm needs it): on the server and in DOM-only test renderers the frames are shown as
 * plain text instead. The screen fills the room down to the foot of its scrolling pane, and fits
 * its rows and columns to its box whenever that changes (`FitAddon`, a `ResizeObserver`, the
 * window's `resize`). Input is off while `attached` is false.
 */
@Component({
  selector: 'ui-terminal-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      #screen
      class="box-border h-[min(40rem,70vh)] font-mono max-h-[95vh] min-h-48 overflow-hidden rounded-md border border-gray-800 bg-gray-900 px-2 text-gray-200 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ocean-deep-300"
      role="group"
      [attr.aria-label]="label()"
    >
      @if (!ready()) {
        <pre class="m-0 font-mono text-xs/5 whitespace-pre-wrap text-gray-200" role="log">{{
          pendingText()
        }}</pre>
      }
    </div>
  `,
})
export class TerminalScreen {
  readonly frames = input.required<ScreenFrames>();
  readonly label = input('Terminal');
  readonly attached = input(false);
  readonly data = output<string>();
  readonly resized = output<ScreenSize>();

  private readonly screen = viewChild.required<ElementRef<HTMLElement>>('screen');
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Whether xterm.js is mounted. */
  protected readonly ready = signal(false);
  protected readonly pendingText = computed(() => this.frames().chunks.join(''));

  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private observer: ResizeObserver | null = null;
  private disposables: IDisposable[] = [];
  private generation = -1;
  private written = 0;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.mount());

    effect(() => {
      const frames = this.frames();
      if (!this.ready() || !this.terminal) return;
      if (frames.generation !== this.generation) {
        this.terminal.reset();
        this.generation = frames.generation;
        this.written = 0;
      }
      for (const chunk of frames.chunks.slice(this.written)) this.terminal.write(chunk);
      this.written = frames.chunks.length;
    });

    effect(() => {
      const attached = this.attached();
      if (this.ready() && this.terminal) this.terminal.options.disableStdin = !attached;
    });

    inject(DestroyRef).onDestroy(() => this.destroy());
  }

  private async mount(): Promise<void> {
    const host = this.screen().nativeElement;
    if (!host.ownerDocument.defaultView?.matchMedia) return;
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
    ]);
    if (this.destroyed) return;

    // xterm.js paints its own colours and font: the box's, from its Tailwind classes.
    const box = host.ownerDocument.defaultView.getComputedStyle(host);
    const terminal = new Terminal({
      cursorBlink: true,
      disableStdin: !this.attached(),
      // Tailwind's `font-mono` stack, as the box sets it: one font, wherever the screen is drawn.
      fontFamily: box.fontFamily,
      fontSize: 13,
      screenReaderMode: true,
      scrollback: 6000,
      theme: {
        background: box.backgroundColor,
        foreground: box.color,
        cursor: box.color,
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminal.textarea?.setAttribute('aria-label', `${this.label()} input`);
    this.disposables = [
      terminal.onData((value) => {
        if (this.attached()) this.data.emit(value);
      }),
      terminal.onResize(({ cols, rows }) => this.resized.emit({ cols, rows })),
    ];
    this.terminal = terminal;
    this.fitAddon = fitAddon;

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => {
        this.relayout();
        this.fit();
      });
      this.observer.observe(host);
    }
    // A host whose height is a measured pixel value does not resize with the window by itself.
    const view = host.ownerDocument.defaultView;
    if (view) {
      const onViewportResize = () => this.relayout();
      view.addEventListener('resize', onViewportResize);
      this.disposables.push({
        dispose: () => view.removeEventListener('resize', onViewportResize),
      });
    }
    this.relayout();
    this.fit();
    this.ready.set(true);
    // Tell the PTY the fitted size even when fitting changed nothing (xterm then fires no resize).
    this.resized.emit({ cols: terminal.cols, rows: terminal.rows });
  }

  /**
   * Sizes the screen to the room between its top and the foot of the pane that scrolls it, so the
   * bottom row (where the prompt sits) ends above the fold. The classes' min and max height clamp
   * the answer.
   */
  private relayout(): void {
    const host = this.screen().nativeElement;
    const view = host.ownerDocument.defaultView;
    if (!view || host.getClientRects().length === 0) return;
    const pane = scrollPane(host);
    const paneTop =
      pane === host.ownerDocument.documentElement ? 0 : pane.getBoundingClientRect().top;
    const top = host.getBoundingClientRect().top - paneTop + pane.scrollTop;
    const below =
      this.root.nativeElement.getBoundingClientRect().bottom - host.getBoundingClientRect().bottom;
    const foot = parseFloat(view.getComputedStyle(pane).paddingBottom) || 0;
    host.style.height = `${Math.max(0, Math.floor(pane.clientHeight - top - below - foot))}px`;
  }

  private fit(): void {
    try {
      this.fitAddon?.fit();
    } catch {
      // A hidden screen has no cell geometry; the ResizeObserver tries again when it shows.
    }
  }

  private destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.disposables.forEach((disposable) => disposable.dispose());
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }
}

/** The ancestor that scrolls `el`, or the document. */
function scrollPane(el: HTMLElement): HTMLElement {
  const view = el.ownerDocument.defaultView;
  for (let node = el.parentElement; node && view; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return el.ownerDocument.documentElement;
}
