import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { githostGoldenMasters, projectsGoldenMasters } from './src/testing/golden-masters';

/**
 * The browser screenshot tests' Vitest config, merged by the `test-browser` target (angular.json).
 *
 * The golden masters live in `node_modules` and are read with `node:fs`, which the browser cannot
 * use. So the reader runs here, on the Node side, and a spec asks for a body through the
 * `goldenMaster` command (`commands.goldenMaster(state, operationId, provider?)` from
 * `vitest/browser`). The provider is `qits-projects` unless named.
 */
const goldenMaster: BrowserCommand<
  [state: string, operationId: string, provider?: 'qits-projects' | 'qits-githost']
> = (_context, state, operationId, provider = 'qits-projects') =>
  (provider === 'qits-githost' ? githostGoldenMasters : projectsGoldenMasters).body(
    state,
    operationId,
  );

export default defineConfig({
  test: {
    browser: {
      commands: { goldenMaster },
      // No screenshot of every failed test: __screenshots__/ holds only the committed references. A
      // reference that does not match writes its actual and diff images to .vitest-attachments/.
      screenshotFailures: false,
      expect: {
        toMatchScreenshot: {
          // Any changed pixel is a failure. The renderer is pinned (CI image), so there is no noise to
          // forgive; a tolerance would let small colour changes pass unnoticed.
          comparatorName: 'pixelmatch',
          comparatorOptions: { threshold: 0, allowedMismatchedPixelRatio: 0 },
        },
      },
    },
  },
});
