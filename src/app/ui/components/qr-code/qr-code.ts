import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/** The quiet zone around the code, in modules: the four the QR standard asks for. */
const QUIET = 4;

/** One QR code: its width in modules, quiet zone included, and the dark modules as one path. */
interface QrDrawing {
  readonly size: number;
  readonly path: string;
}

/**
 * `text` as a QR code, drawn here as inline SVG (qits-2262: a WireGuard app scans a device's config
 * off the Network access page). The code is made in the page by `qrcode-generator`, a dependency
 * with no network of its own, so the text never leaves the browser; error correction M, the
 * smallest version that holds it, in byte mode.
 *
 * ```html
 * <ui-qr-code [text]="config" label="The device's WireGuard config" />
 * ```
 *
 * A scanner wants dark modules on a light ground, so the code is drawn that way in both schemes:
 * `light-dark()` picks the semantic token that is dark (the modules) and light (the ground) under
 * each. A text too long for the largest version draws nothing.
 */
@Component({
  selector: 'ui-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (drawing(); as qr) {
      <svg
        class="block h-auto w-full bg-[light-dark(var(--color-surface),var(--color-fg))] fill-[light-dark(var(--color-fg),var(--color-surface))]"
        role="img"
        [attr.aria-label]="label()"
        [attr.viewBox]="'0 0 ' + qr.size + ' ' + qr.size"
        shape-rendering="crispEdges"
      >
        <path [attr.d]="qr.path" />
      </svg>
    }
  `,
})
export class QrCode {
  /** What the code holds. */
  readonly text = input.required<string>();
  /** The image's accessible name. */
  readonly label = input('QR code');

  protected readonly drawing = computed((): QrDrawing | undefined => qrDrawing(this.text()));
}

/** `text`'s QR code as an SVG path, one unit square per dark module; undefined when it cannot. */
export function qrDrawing(text: string): QrDrawing | undefined {
  const qr = qrcode(0, 'M');
  try {
    qr.addData(text, 'Byte');
    qr.make();
  } catch {
    return undefined;
  }
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return { size: count + 2 * QUIET, path };
}
