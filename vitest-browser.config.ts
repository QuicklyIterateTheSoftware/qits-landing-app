import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { projectsGoldenMasters } from './src/testing/golden-masters';

/**
 * The browser screenshot tests' Vitest config, merged by the `test-browser` target (angular.json).
 *
 * The golden masters live in `node_modules` and are read with `node:fs`, which the browser cannot
 * use. So the reader runs here, on the Node side, and a spec asks for a body through the
 * `goldenMaster` command (`commands.goldenMaster(state, operationId)` from `vitest/browser`).
 */
const goldenMaster: BrowserCommand<[state: string, operationId: string]> = (
  _context,
  state,
  operationId,
) => projectsGoldenMasters.body(state, operationId);

export default defineConfig({
  test: {
    browser: {
      commands: { goldenMaster },
      // No screenshot of every failed test: __screenshots__/ holds only the committed references. A
      // reference that does not match writes its actual and diff images to .vitest-attachments/.
      screenshotFailures: false,
      expect: {
        toMatchScreenshot: {
          // A changed pixel is a failure; anti-aliasing noise is not.
          comparatorName: 'pixelmatch',
          comparatorOptions: { threshold: 0.1, allowedMismatchedPixelRatio: 0 },
        },
      },
    },
  },
});
