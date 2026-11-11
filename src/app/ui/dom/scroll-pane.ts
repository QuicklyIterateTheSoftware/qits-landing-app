/**
 * The box that scrolls an element, whichever it is: the document below 768px, where the shell lets
 * the document scroll, and from 768px up the shell's own `<main>` or sidebar, which scroll each on
 * their own while the window never does (`ShellLayout`), or any pane of a page that scrolls itself
 * (the UI builder's columns). What measures room or scrolls along with the pointer (the terminal's
 * screen, the reorder drags) asks here instead of assuming the window.
 */

/**
 * The nearest ancestor of `el` that scrolls it vertically (`overflow-y` `auto` or `scroll`, and
 * taller inside than its box), or the document's root element when none does. The height check
 * skips a box that only scrolls sideways (`overflow-x-auto` computes `overflow-y` to `auto` too). The root element stands for the window: its `scrollTop`,
 * `scrollBy` and `clientHeight` are the window's.
 */
export function scrollPane(el: Element): HTMLElement {
  const view = el.ownerDocument.defaultView;
  for (let node = el.parentElement; node && view; node = node.parentElement) {
    const { overflowY } = view.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return el.ownerDocument.documentElement;
}

/**
 * The part of the window `pane` shows its content in, in viewport px: from its top edge (inside its
 * border; 0 for the document, or where the pane runs above the window) down to its bottom edge
 * (above a horizontal scrollbar; at most the window's bottom).
 */
export function paneBounds(pane: HTMLElement): { readonly top: number; readonly bottom: number } {
  const viewport = pane.ownerDocument.documentElement.clientHeight;
  if (pane === pane.ownerDocument.documentElement) return { top: 0, bottom: viewport };
  const top = pane.getBoundingClientRect().top + pane.clientTop;
  return { top: Math.max(0, top), bottom: Math.min(viewport, top + pane.clientHeight) };
}
