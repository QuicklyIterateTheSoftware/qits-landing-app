import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  untracked,
} from '@angular/core';

/**
 * The box an ER diagram is drawn in (qits-2014): the diagram at its natural size, one CSS pixel
 * per unit of its `viewBox`, scrolled so that `table`'s box is in view, centred where it can be.
 *
 * `<qits-mermaid-diagram>` fits its svg to its width (`max-width: 100%; height: auto`, mermaid's
 * own `width="100%"`), which draws a unit of dozens of tables at a few percent of its size, and no
 * CSS from outside undoes it (`width: auto; max-width: none` still resolves to 100%). So once the
 * svg is drawn, and again whenever it is drawn anew (the definition, or the color scheme, changed),
 * its width and height are set from its `viewBox` inline. The host is the scroll box; it scrolls
 * itself only, never the window. A table the diagram does not draw leaves it at the top-left.
 *
 * mermaid's `erDiagram` names each table's group `<diagram id>-entity-<table>-<n>`
 * (`qits-mermaid-1-entity-agent_harness_capability-2`), which is how `table` is found.
 */
@Directive({ selector: '[appErDiagramBox]' })
export class ErDiagramBox {
  /** The table to scroll into view; null scrolls nowhere. */
  readonly table = input<string | null>(null, { alias: 'appErDiagramBox' });

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** The svg last scrolled to, so that a later mutation does not take the visitor's scroll away. */
  private scrolled?: SVGSVGElement;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // The diagram's own `hidden` is watched too: a drawn svg is laid out only once it is shown.
    const observer = new MutationObserver(() => this.fit());
    observer.observe(this.host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden'],
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
    effect(() => {
      this.table();
      untracked(() => {
        this.scrolled = undefined;
        this.fit();
      });
    });
  }

  private fit(): void {
    const svg = this.host.querySelector('svg');
    if (!svg) return;
    naturalSize(svg);
    if (svg === this.scrolled || svg.closest('[hidden]')) return;
    this.scrolled = svg;
    const table = this.table();
    const group = table ? tableGroup(svg, table) : null;
    if (group) centre(this.host, group);
  }
}

/** Sets `svg`'s width and height to its `viewBox`'s, in CSS pixels; one without a viewBox stays. */
function naturalSize(svg: SVGSVGElement): void {
  const [, , width, height] = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!(width > 0 && height > 0)) return;
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.style.maxWidth = 'none';
}

/** The group mermaid draws `table` in: an id ending in `-entity-<table>-<digits>`. */
function tableGroup(svg: SVGSVGElement, table: string): SVGGElement | null {
  return (
    [...svg.querySelectorAll<SVGGElement>('g[id]')].find(
      (g) => /-entity-(.+)-\d+$/.exec(g.id)?.[1] === table,
    ) ?? null
  );
}

/**
 * Scrolls `box` (only) so that `target` sits in the middle of it, as far as the box can scroll; a
 * target larger than the box along an axis is aligned to its start instead, so its header shows.
 */
function centre(box: HTMLElement, target: Element): void {
  const outer = box.getBoundingClientRect();
  const inner = target.getBoundingClientRect();
  const left = inner.left - outer.left - box.clientLeft + box.scrollLeft;
  const top = inner.top - outer.top - box.clientTop + box.scrollTop;
  box.scrollLeft = Math.max(0, Math.min(left, left + inner.width / 2 - box.clientWidth / 2));
  box.scrollTop = Math.max(0, Math.min(top, top + inner.height / 2 - box.clientHeight / 2));
}
