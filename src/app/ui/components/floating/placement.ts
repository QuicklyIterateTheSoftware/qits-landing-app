/** Which edge of the trigger a floating panel lines up with: `start` (left) or `end` (right). */
export type FloatingAlign = 'start' | 'end';

/** Which side of the trigger the panel ended up on. */
export type FloatingSide = 'below' | 'above';

/** The part of a rectangle `place` reads: the trigger's box in window coordinates. */
export interface TriggerBox {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Where `place` puts the panel, in window coordinates. */
export interface Placement {
  readonly top: number;
  readonly left: number;
  /** The panel's cap when it fits neither below nor above; null when it fits as it is. */
  readonly maxHeight: number | null;
  readonly side: FloatingSide;
}

/** What `place` needs besides the two boxes. */
export interface PlaceOptions {
  readonly align: FloatingAlign;
  /** The room between the trigger and the panel. */
  readonly gap?: number;
  /** The room the panel keeps from the window's edges. */
  readonly margin?: number;
}

/**
 * Where a panel of `panel`'s size goes against a trigger at `trigger`, in a window of `viewport`'s
 * size. A pure function: the floating directive measures, this decides.
 *
 * Below the trigger, on the `align` side: `start` lines the panel's left edge up with the
 * trigger's, `end` its right edge. Without room on that side it hangs from the other edge instead,
 * and either way it is clamped inside the window, `margin` from its edges. Without room below it
 * goes above; with room neither below nor above it takes the larger of the two and is capped to
 * it (`maxHeight`), to scroll within itself.
 */
export function place(
  trigger: TriggerBox,
  panel: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  { align, gap = 0, margin = 8 }: PlaceOptions,
): Placement {
  const fromLeft = trigger.left;
  const fromRight = trigger.right - panel.width;
  const fitsFromLeft = fromLeft + panel.width <= viewport.width - margin;
  const fitsFromRight = fromRight >= margin;
  let left =
    align === 'start'
      ? fitsFromLeft || !fitsFromRight
        ? fromLeft
        : fromRight
      : fitsFromRight || !fitsFromLeft
        ? fromRight
        : fromLeft;
  left = Math.max(margin, Math.min(left, viewport.width - margin - panel.width));

  const below = viewport.height - margin - (trigger.bottom + gap);
  const above = trigger.top - gap - margin;
  let side: FloatingSide;
  let maxHeight: number | null = null;
  let height = panel.height;
  if (panel.height <= below) side = 'below';
  else if (panel.height <= above) side = 'above';
  else {
    side = below >= above ? 'below' : 'above';
    maxHeight = Math.max(0, Math.max(below, above));
    height = maxHeight;
  }
  let top = side === 'below' ? trigger.bottom + gap : trigger.top - gap - height;
  // A trigger scrolled partly out of the window: the panel still stays inside it.
  top = Math.max(margin, Math.min(top, viewport.height - margin - height));
  return { top, left, maxHeight, side };
}
