/**
 * Setup for the browser screenshot tests (`*.browser.spec.ts`): the same pixels on every machine.
 *
 * - The font is Inter from this repository (`fonts/`), never a system font: system fonts differ
 *   between machines and would change every screenshot.
 * - Animations and transitions are off, and the caret does not blink. SVG animations (SMIL, as in
 *   `ui-spinner`) are not CSS, so every `<svg>` is paused at its first frame as it is added.
 * - Backend data in every screenshot but a dumb component's (`src/app/ui/`) comes from golden
 *   masters only: a 2xx `flush` must carry a recording (`golden-master.ts`), or the test fails
 *   (`guardGoldenMasters`).
 * - After each spec file, the routes the guard saw its recorded answers shown on go to the route
 *   ledger, `src/testing/browser/routes.json`, which the pact specs read (`qits-trigger.route`).
 *   The Node side rewrites a spec's section at the end of the run, and only when every test in the
 *   file ran and passed (ticket qits-1966). The files share one page, so the guard clears its
 *   routes as each file starts and sends only the ones this file noted; a file that never sends
 *   keeps its section (ticket qits-2056).
 * - Every passing screenshot is also frozen as HTML (`freezeScreenshots`, ticket qits-1947): the
 *   element with its CSS, the route it was on and the recorded answers its test showed, written to
 *   `src/testing/browser/freezes/` with the app's route tree in its `manifest.json`. Every shot is
 *   taken twice, LIGHT then DARK (`colorSchemes`, qits-2086): `prefers-color-scheme` emulated and
 *   `data-theme` set on `<html>`, so the theme's tokens switch; its PNGs and freezes end in
 *   `-light` / `-dark`. The page's own background and text are the theme's `--color-surface` and
 *   `--color-fg` (defined by `@qits/ui-components/theme.css`, which `src/styles.css` imports and the
 *   test page loads as its global stylesheet), so a dark shot is dark to its edges.
 * - Every declared outcome a test reaches (`go()`, `reach()`, a `QitsExit` click) is recorded
 *   (`recordOutcomes`, epic qits-2000) and sent to the Node side, which links it to the test's
 *   screenshots in `manifest.json`; `qits-angular screenshots --check --enforce-outcomes` fails a
 *   declared outcome no test reaches, or whose trigger no screenshot shows.
 */
import {
  DEFAULT_EMPTIED_ELEMENTS,
  DEFAULT_ROUTE_SPECS,
  freezeScreenshots,
  guardGoldenMasters,
  recordOutcomes,
  takeRouteRecords,
} from '@qits/angular/testing/browser';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { commands } from 'vitest/browser';
import { routes } from '../../app/app.routes';

// Every browser spec but the dumb components' (src/app/ui/, which take synthetic inputs). The
// library's default checks page and layout specs only.
guardGoldenMasters({
  when: () => !/[\\/]src[\\/]app[\\/]ui[\\/]/.test(expect.getState().testPath ?? ''),
});

// Every passing screenshot, frozen as HTML beside the app's route tree (no lazy route is loaded).
// Every toMatchScreenshot(...) must name its kind (lint qits/screenshot-kind backs this up at
// review time), every route spec (page/layout) shoots at PHONE/TABLET/DESKTOP by default, and
// every shot is taken in both colour schemes, LIGHT then DARK (qits-2086), unless it opts out with
// `{ colorSchemes: ['LIGHT'], reason }`. Besides xterm's screen-reader tree (the default), its
// live region is frozen empty: it announces the terminal's text whenever xterm gets to it, so a
// freeze caught it in one run and not the next (qits-2087).
freezeScreenshots({
  routes,
  requireKind: true,
  viewportSpecs: DEFAULT_ROUTE_SPECS,
  colorSchemes: ['LIGHT', 'DARK'],
  emptyElements: [...DEFAULT_EMPTIED_ELEMENTS, '.xterm-accessibility .live-region'],
});

// Every declared outcome each test reaches, for the manifest and the outcome check.
recordOutcomes();

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
    background: var(--color-surface);
    color: var(--color-fg);
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
// the next screenshot. Park it off the page before every test: its top-left corner is on the
// fixture, which a hover applied a frame late would put in the screenshot only some of the time.
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

// The routes this spec file showed its recorded answers on (the guard notes them), to the route
// ledger: the Node side stages them, and rewrites this file's section of
// `src/testing/browser/routes.json` at the end of the run if the file ran completely. A route
// noted in another file is dropped here with a warning (ticket qits-2056).
afterAll(async () => {
  await commands.goldenMasterRoutes(takeRouteRecords());
});
