/**
 * The UI builder's pitch diff (qits-2158): an agent's pitch is an HTML mock of a frozen screenshot,
 * shown beside the original frozen HTML. Diff mode grays out the pitch's unchanged nodes, outlines
 * its changed and added ones, and lists what the pitch dropped. This is the pure DOM comparison; the
 * page wires it to the rendered frames and the toggle.
 *
 * Matching walks both `<body>`s together, pairing each parent's element children by an LCS over a
 * key — lowercased tag, `#id` when the element has one, and the value of every
 * `data-qits-source`/`data-qits-item`/`data-qits-field`/`data-qits-derived`/`data-qits-outcome`
 * attribute it carries — so a reordered list still lines its items up by identity rather than
 * position. `<script>`, `<style>` and `<template>` children take no part in it: neither matched,
 * marked nor removed.
 */

/** A pitch element's diff state, relative to the original it was compared against. */
export type DiffMark = 'same' | 'changed' | 'added';

/** An original element the pitch dropped; its subtree is not listed separately. */
export interface RemovedNode {
  tag: string;
  text: string;
}

/** The result of {@link diffPitch}: every pitch element's mark, and what the pitch removed. */
export interface PitchDiff {
  marks: Map<Element, DiffMark>;
  removed: RemovedNode[];
}

/** The attribute {@link applyDiff} writes and {@link clearDiff} removes, carrying a {@link DiffMark}. */
export const DIFF_ATTRIBUTE = 'data-qits-builder-diff';

/** The attributes an element's matching key carries the value of, in addition to its tag and id. */
const KEY_ATTRIBUTES = [
  'data-qits-source',
  'data-qits-item',
  'data-qits-field',
  'data-qits-derived',
  'data-qits-outcome',
] as const;

/** Tags that take no part in the diff: present in neither tree's walk. */
const SKIPPED_TAGS = new Set(['script', 'style', 'template']);

/**
 * Diffs the pitch's `<body>` against the original's. Elements of `pitch` are keys of `marks`;
 * `original` is never modified.
 */
export function diffPitch(original: Document, pitch: Document): PitchDiff {
  const marks = new Map<Element, DiffMark>();
  const removed: RemovedNode[] = [];
  diffChildren(elementChildren(original.body), elementChildren(pitch.body), marks, removed);
  return { marks, removed };
}

/** Sets `DIFF_ATTRIBUTE=<mark>` on every marked element of the diff (they belong to the rendered pitch doc). */
export function applyDiff(diff: PitchDiff): void {
  const settled = new Map<Element, boolean>();
  const allSame = (element: Element): boolean => {
    let same = settled.get(element);
    if (same === undefined) {
      same = diff.marks.get(element) !== 'changed' && diff.marks.get(element) !== 'added';
      for (const child of Array.from(element.children)) {
        same = allSame(child) && same;
      }
      settled.set(element, same);
    }
    return same;
  };
  for (const [element, mark] of diff.marks) {
    if (mark !== 'same') {
      element.setAttribute(DIFF_ATTRIBUTE, mark);
    } else if (
      allSame(element) &&
      !(
        element.parentElement &&
        diff.marks.get(element.parentElement) === 'same' &&
        allSame(element.parentElement)
      )
    ) {
      // Only the top of a wholly unchanged subtree dims: opacity composites down the tree, so a
      // `same` ancestor of a change would dim the change too, and a nested `same` would dim twice.
      element.setAttribute(DIFF_ATTRIBUTE, mark);
    }
  }
}

/** Removes `DIFF_ATTRIBUTE` from every element of `doc`. */
export function clearDiff(doc: Document): void {
  doc.querySelectorAll(`[${DIFF_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(DIFF_ATTRIBUTE);
  });
}

/**
 * The CSS the page injects into the pitch frame while diff mode is on: `same` dims and desaturates,
 * `changed`/`added` outline in `accent`. {@link applyDiff} writes `same` only on the top of a wholly
 * unchanged subtree, so no change sits inside a dimmed element and nothing dims twice.
 */
export function diffCss(accent: string): string {
  return `
    [${DIFF_ATTRIBUTE}='same'] {
      opacity: 0.35;
      filter: grayscale(1);
    }
    [${DIFF_ATTRIBUTE}='changed'],
    [${DIFF_ATTRIBUTE}='added'] {
      outline: 2px solid ${accent};
      outline-offset: -1px;
    }
  `;
}

/**
 * Matches `originals` against `pitches` by an LCS over {@link keyOf}, recurses into each matched
 * pair, marks every unmatched pitch element (and its subtree) `added`, and appends one
 * {@link RemovedNode} per unmatched original element, in document order.
 */
function diffChildren(
  originals: readonly Element[],
  pitches: readonly Element[],
  marks: Map<Element, DiffMark>,
  removed: RemovedNode[],
): void {
  let oi = 0;
  let pi = 0;
  for (const [matchedO, matchedP] of lcsMatch(originals, pitches)) {
    while (oi < matchedO) removed.push(removedNodeOf(originals[oi++]));
    while (pi < matchedP) markAdded(pitches[pi++], marks);
    diffElement(originals[oi++], pitches[pi++], marks, removed);
  }
  while (oi < originals.length) removed.push(removedNodeOf(originals[oi++]));
  while (pi < pitches.length) markAdded(pitches[pi++], marks);
}

/** Marks a matched pair `same` or `changed`, then diffs their element children. */
function diffElement(
  original: Element,
  pitch: Element,
  marks: Map<Element, DiffMark>,
  removed: RemovedNode[],
): void {
  marks.set(pitch, sameElement(original, pitch) ? 'same' : 'changed');
  diffChildren(elementChildren(original), elementChildren(pitch), marks, removed);
}

/** Marks `element` and every descendant (excluding script/style/template) `added`. */
function markAdded(element: Element, marks: Map<Element, DiffMark>): void {
  marks.set(element, 'added');
  for (const child of elementChildren(element)) markAdded(child, marks);
}

/** The one {@link RemovedNode} an unmatched original element yields. */
function removedNodeOf(element: Element): RemovedNode {
  return {
    tag: element.tagName.toLowerCase(),
    text: truncate(collapse(element.textContent ?? '')),
  };
}

/** An element's own direct children, skipping script/style/template. */
function elementChildren(element: Element): Element[] {
  return Array.from(element.children).filter(
    (child) => !SKIPPED_TAGS.has(child.tagName.toLowerCase()),
  );
}

/**
 * A pitch element matched to an original one is `same` when their tags, their attribute sets
 * (ignoring the page's own `data-qits-builder*` attributes and Angular's `_ngcontent-`/`_nghost-`
 * ones) and their own direct text (concatenated, whitespace-collapsed) all agree.
 */
function sameElement(original: Element, pitch: Element): boolean {
  return (
    original.tagName.toLowerCase() === pitch.tagName.toLowerCase() &&
    attributesEqual(original, pitch) &&
    directText(original) === directText(pitch)
  );
}

/** Whether `a` and `b` carry the same comparable attributes (see {@link sameElement}). */
function attributesEqual(a: Element, b: Element): boolean {
  const onA = comparableAttributes(a);
  const onB = comparableAttributes(b);
  if (onA.size !== onB.size) return false;
  for (const [name, value] of onA) {
    if (onB.get(name) !== value) return false;
  }
  return true;
}

/** `element`'s attributes worth comparing, normalized: `class` as a sorted token set, `style` as collapsed text, either left out when empty. */
function comparableAttributes(element: Element): Map<string, string> {
  const result = new Map<string, string>();
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (ignoredAttribute(name)) continue;
    if (name === 'class' || name === 'style') {
      // An empty class or style is no class or style: a rendered frame gains `style=""` as soon as
      // anything touches an element's style, which the parsed original never shows.
      const value = name === 'class' ? classTokens(attribute.value) : collapse(attribute.value);
      if (value) result.set(name, value);
    } else result.set(name, attribute.value);
  }
  return result;
}

/** The page's own highlight/diff attributes, and Angular's per-component generated ones. */
function ignoredAttribute(name: string): boolean {
  return (
    name.startsWith('data-qits-builder') ||
    name.startsWith('_ngcontent-') ||
    name.startsWith('_nghost-')
  );
}

/** `class`'s value as a sorted, deduplicated set of tokens, so a reorder compares equal. */
function classTokens(value: string): string {
  return [...new Set(value.trim().split(/\s+/).filter(Boolean))].sort().join(' ');
}

/** An element's direct text, its Text node children only (not descendants'), collapsed and trimmed. */
function directText(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
  }
  return collapse(text);
}

/** Runs of whitespace to one space, trimmed. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** `text`, cut to 80 characters with a trailing `…` when it was longer. */
function truncate(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** An element's matching key: lowercased tag, `#id` when present, then every {@link KEY_ATTRIBUTES} value present. */
function keyOf(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const attributes = KEY_ATTRIBUTES.map((name) => {
    const value = element.getAttribute(name);
    return value === null ? '' : `|${name}=${value}`;
  }).join('');
  return `${element.tagName.toLowerCase()}${id}${attributes}`;
}

/**
 * The longest common subsequence of `originals` and `pitches` by {@link keyOf} equality, as pairs of
 * indices into each, in increasing order of both. O(n*m) per sibling list, which is fine for the few
 * thousand nodes a frozen page holds.
 */
function lcsMatch(
  originals: readonly Element[],
  pitches: readonly Element[],
): Array<readonly [number, number]> {
  const n = originals.length;
  const m = pitches.length;
  const originalKeys = originals.map(keyOf);
  const pitchKeys = pitches.map(keyOf);
  const lengths: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i][j] =
        originalKeys[i] === pitchKeys[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const pairs: Array<readonly [number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (originalKeys[i] === pitchKeys[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
