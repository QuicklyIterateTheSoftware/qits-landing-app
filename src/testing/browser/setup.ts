/**
 * Setup for the browser screenshot tests (`*.browser.spec.ts`): the same pixels on every machine.
 *
 * - The font is Inter from this repository (`fonts/`), never a system font: system fonts differ
 *   between machines and would change every screenshot.
 * - Animations and transitions are off, and the caret does not blink.
 */
import { beforeAll } from 'vitest';

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

beforeAll(async () => {
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
