import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/** The longest preview drawn; the copy button copies all of it. */
export const PREVIEW_CHARS = 12_000;

/** `text` cut at `limit` characters, with an ellipsis line when cut. */
export function previewOf(text: string, limit = PREVIEW_CHARS): string {
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text;
}

/**
 * A block of pretty-printed JSON (or any text) with a heading and a Copy button (qits-1994): the
 * preview is cut at {@link PREVIEW_CHARS}, the button copies the whole text. Without a clipboard
 * (an insecure origin, a denied permission) the preview stays selectable and the button says
 * nothing.
 */
@Component({
  selector: 'ui-json-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="mb-1 flex items-center gap-2">
      <h4 class="m-0 text-xs font-semibold text-fg-soft uppercase">{{ heading() }}</h4>
      <button
        type="button"
        class="copy ml-auto cursor-pointer rounded border border-line-strong px-1.5 text-xs hover:bg-surface-subtle"
        (click)="copy()"
      >
        {{ copied() ? 'Copied' : copyLabel() }}
      </button>
    </div>
    <pre
      class="json m-0 max-h-96 overflow-auto rounded bg-surface-subtle p-2 font-mono text-[0.6875rem] leading-4"
      >{{ preview() }}</pre>
  `,
})
export class JsonBlock {
  readonly json = input.required<string>();
  readonly heading = input('Recorded response');
  readonly copyLabel = input('Copy JSON');

  protected readonly copied = signal(false);
  protected readonly preview = computed(() => previewOf(this.json()));

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.json());
      this.copied.set(true);
    } catch {
      // No clipboard: the preview stays selectable.
    }
  }
}
