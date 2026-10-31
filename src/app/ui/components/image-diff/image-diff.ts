import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Spinner } from '$ui/components/spinner/spinner';

/** One side of an image change: still coming, the image's bytes, or why there is none. */
export type ImageDiffSide =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly blob: Blob }
  | { readonly status: 'error'; readonly message: string };

const LOADING: ImageDiffSide = { status: 'loading' };

/** One drawn side: its heading, its state, and the object URL of its bytes once loaded. */
interface Pane {
  readonly label: string;
  readonly side: ImageDiffSide;
  readonly url: string | null;
}

/**
 * A changed image, drawn as images rather than a diff: an added one shows the new image only, a
 * deleted one the old image only, and any other change (modified, renamed, type changed, copied)
 * "Before" and "After" side by side, stacked on a narrow screen. Each image fits its column and is
 * never drawn larger than it is; its pixel size, read once it has loaded, is written beneath.
 *
 * ```html
 * <ui-image-diff changeType="MODIFIED" [before]="before()" [after]="after()" />
 * ```
 *
 * A side still coming shows the spinner. A side that failed says why in a sentence (`message`), and
 * so does bytes the browser cannot draw: never a broken image icon. The bytes are shown through
 * object URLs, made in the browser only and revoked when a side changes and when the view goes.
 */
@Component({
  selector: 'ui-image-diff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Spinner],
  host: { class: 'block min-w-0' },
  template: `
    <div [class]="panes().length > 1 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'">
      @for (pane of panes(); track pane.label) {
        <figure class="m-0 min-w-0 rounded border border-charcoal-brown-200 p-2">
          <figcaption class="mb-2 text-xs font-semibold text-charcoal-brown-600">
            {{ pane.label }}
          </figcaption>
          @if (pane.side.status === 'error') {
            <p class="m-0 text-sm text-charcoal-brown-500" role="status">
              {{ pane.side.message }}
            </p>
          } @else if (pane.url && broken()[pane.url]) {
            <p class="m-0 text-sm text-charcoal-brown-500" role="status">
              The image could not be shown.
            </p>
          } @else {
            <ui-spinner [state]="pane.url ? 'loaded' : 'loading'" class="min-h-24">
              @if (pane.url) {
                <img
                  class="block h-auto max-w-full"
                  [src]="pane.url"
                  [alt]="pane.label + ' the change'"
                  (load)="measured($event, pane.url)"
                  (error)="failed(pane.url)"
                />
                <p class="m-0 mt-1 text-xs text-charcoal-brown-500">
                  {{ sizes()[pane.url] ?? '' }}
                </p>
              }
            </ui-spinner>
          }
        </figure>
      }
    </div>
  `,
})
export class ImageDiff {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The change, as qits-projects names it: `ADDED`, `DELETED`, `MODIFIED`, `RENAMED`, … */
  readonly changeType = input<string | undefined>(undefined);
  /** The image before the change; unused for an added one. */
  readonly before = input<ImageDiffSide>(LOADING);
  /** The image after the change; unused for a deleted one. */
  readonly after = input<ImageDiffSide>(LOADING);

  /** Each loaded image's pixel size (`640 × 480 px`), by object URL. */
  protected readonly sizes = signal<Readonly<Record<string, string>>>({});
  /** The object URLs whose bytes the browser could not draw. */
  protected readonly broken = signal<Readonly<Record<string, true>>>({});

  // The blob first, so a side handed again with the same bytes keeps its URL.
  private readonly beforeBlob = computed(() => blobOf(this.before()));
  private readonly afterBlob = computed(() => blobOf(this.after()));
  private readonly beforeUrl = computed(() => this.urlOf(this.beforeBlob()));
  private readonly afterUrl = computed(() => this.urlOf(this.afterBlob()));

  protected readonly panes = computed<readonly Pane[]>(() => {
    const before: Pane = { label: 'Before', side: this.before(), url: this.beforeUrl() };
    const after: Pane = { label: 'After', side: this.after(), url: this.afterUrl() };
    switch (this.changeType()) {
      case 'ADDED':
        return [after];
      case 'DELETED':
        return [before];
      default:
        return [before, after];
    }
  });

  constructor() {
    // Each URL lives until its side changes or the view goes.
    for (const url of [this.beforeUrl, this.afterUrl]) {
      effect((onCleanup) => {
        const made = url();
        if (made) onCleanup(() => URL.revokeObjectURL(made));
      });
    }
  }

  protected measured(event: Event, url: string): void {
    const image = event.target as HTMLImageElement;
    this.sizes.update((sizes) => ({
      ...sizes,
      [url]: `${image.naturalWidth} × ${image.naturalHeight} px`,
    }));
  }

  protected failed(url: string): void {
    this.broken.update((broken) => ({ ...broken, [url]: true }));
  }

  private urlOf(blob: Blob | null): string | null {
    return this.browser && blob ? URL.createObjectURL(blob) : null;
  }
}

const blobOf = (side: ImageDiffSide) => (side.status === 'loaded' ? side.blob : null);
