/**
 * Setup for the browser screenshot tests (`*.browser.spec.ts`): the same pixels on every machine.
 *
 * - The font is Inter from this repository (`fonts/`), never a system font: system fonts differ
 *   between machines and would change every screenshot.
 * - Animations and transitions are off, and the caret does not blink. SVG animations (SMIL, as in
 *   `ui-spinner`) are not CSS, so every `<svg>` is paused at its first frame as it is added.
 * - Backend data in a page's or a layout's screenshots comes from golden masters only: a 2xx
 *   `flush` must carry a recording (`golden-master.ts`), or the test fails (`guardGoldenMasters`).
 */
import { guardGoldenMasters } from '@qits/angular/testing/browser';
import { afterEach, beforeAll, beforeEach } from 'vitest';
import { commands } from 'vitest/browser';

guardGoldenMasters();

const FONTS = '/src/testing/browser/fonts';

const CSS = `
  @font-face {
    font-family: 'Inter Test';
    font-weight: 400;
    src: url('${FONTS}/inter-latin-400-normal.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Inter Test';
    font-weight: 600;
    src: url('${FONTS}/inter-latin-600-normal.woff2') format('woff2');
  }
  html, body {
    margin: 0;
    background: #ffffff;
    color: #111827;
    font-family: 'Inter Test', sans-serif;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

/** Pauses an SVG's own animations at time 0, and those of every `<svg>` inside a node. */
function freeze(node: Node): void {
  if (!(node instanceof Element)) return;
  const svgs = node instanceof SVGSVGElement ? [node] : [...node.querySelectorAll('svg')];
  for (const svg of svgs) {
    svg.pauseAnimations();
    svg.setCurrentTime(0);
  }
}

beforeAll(async () => {
  new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(freeze);
  }).observe(document.documentElement, { childList: true, subtree: true });
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  await Promise.all([
    document.fonts.load("400 16px 'Inter Test'"),
    document.fonts.load("600 16px 'Inter Test'"),
  ]);
  if (!document.fonts.check("600 16px 'Inter Test'")) {
    throw new Error(`the test font did not load from ${FONTS}`);
  }
});

// The pointer stays where the previous test clicked: over a card it would draw a hover ring into
// the next screenshot. Park it in the top-left corner before every test.
beforeEach(async () => {
  await commands.parkPointer();
});

// Every spec file runs in one shared page, and TestBed's root element sits directly in <body>: a
// spec that styles `fixture.nativeElement.parentElement` (the menus make <body> a 25rem flex row)
// styles <body> for every file after it. Which files come after it changes from run to run, so a
// leaked style turns into screenshots of a different size. Clear it after every test.
afterEach(() => {
  document.body.removeAttribute('style');
});
