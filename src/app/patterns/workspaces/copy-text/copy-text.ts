import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type { Action } from '$ui/components/action-button/action';
import { ActionButton } from '$ui/components/action-button/action-button';

/** How long the button says "Copied" after a copy. */
export const COPIED_MS = 2000;

/**
 * A command (or any one line) shown as code, with a Copy button that puts it on the clipboard and
 * says "Copied" for two seconds (epic qits-1230: the Runners page's login commands, install line
 * and registration token). Without a clipboard (an insecure origin, a denied permission, the
 * server render) the press does nothing: the text is on screen to select.
 */
@Component({
  selector: 'app-copy-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionButton],
  host: { class: 'flex items-start gap-2' },
  template: `
    <code
      class="min-w-0 flex-1 rounded-md bg-charcoal-brown-50 px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap text-charcoal-brown-900"
      >{{ text() }}</code
    >
    <ui-action-button [action]="copy()" />
  `,
})
export class CopyText {
  private readonly document = inject(DOCUMENT);

  readonly text = input.required<string>();
  /** The button's label before a copy (`Copy`, `Copy install line`). */
  readonly label = input('Copy');

  protected readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected readonly copy = computed((): Action => ({
    label: this.copied() ? 'Copied' : this.label(),
    variant: 'muted',
    callback: () => void this.write(),
  }));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  private async write(): Promise<void> {
    const clipboard = this.document.defaultView?.navigator?.clipboard;
    if (!clipboard) return;
    try {
      await clipboard.writeText(this.text());
    } catch {
      return;
    }
    this.copied.set(true);
    this.clear();
    this.timer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
