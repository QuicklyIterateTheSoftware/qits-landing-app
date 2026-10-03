// Runs before the browser screenshot tests (`npm run test:browser`).
//
// The committed reference screenshots match only on the renderer that made them: the same Chromium
// build, fonts and OS libraries. That renderer is the step image `qits/build-images/node-browser-base`
// (CI's QA step) and the workspace image built FROM it. Both describe themselves in
// /etc/qits-renderer-provenance, and `src/testing/browser/renderer.txt` is a copy of that file from
// the machine that made the references.
//
// - On a machine without the file (a workstation): refuse.
// - When the file differs from the committed copy: refuse; the references need regenerating.
// - With no committed copy there are no references yet: let the run go on, where every missing
//   reference fails (CI compares only).
// - With UPDATE_SNAPSHOT set (the platform's regeneration task): write the copy instead.
//
// It also checks that the `playwright` package equals the image's Playwright, because Playwright
// only finds the Chromium of its own version.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const PROVENANCE = '/etc/qits-renderer-provenance';
const COMMITTED = new URL('../src/testing/browser/renderer.txt', import.meta.url);

const fail = (message) => {
  console.error(`test:browser: ${message}`);
  process.exit(1);
};

if (!existsSync(PROVENANCE)) {
  fail(
    `${PROVENANCE} is missing, so this machine is not the screenshot renderer. ` +
      'The tests run in CI and in a workspace, both on qits/build-images/node-browser-base.',
  );
}
const actual = readFileSync(PROVENANCE, 'utf8');

const image = actual.match(/^playwright=(.+)$/m)?.[1];
const installed = createRequire(import.meta.url)('playwright/package.json').version;
if (image !== installed) {
  fail(
    `the playwright package is ${installed}, the renderer image has ${image}. ` +
      'Pin playwright to the image version, or release the image at the new version first.',
  );
}

if (process.env.UPDATE_SNAPSHOT) {
  writeFileSync(COMMITTED, actual);
  process.exit(0);
}
if (existsSync(COMMITTED) && readFileSync(COMMITTED, 'utf8') !== actual) {
  fail(
    'the renderer differs from the one that made the reference screenshots ' +
      '(src/testing/browser/renderer.txt). Trigger the qits-maintenance task that regenerates them.',
  );
}
