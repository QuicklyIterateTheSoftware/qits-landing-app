import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import {
  edgeGoldenMasters,
  eventsGoldenMasters,
  githostGoldenMasters,
  maintenanceGoldenMasters,
  projectsGoldenMasters,
} from './src/testing/golden-masters';

/**
 * The browser screenshot tests' Vitest config, merged by the `test-browser` target (angular.json).
 *
 * The golden masters live in `node_modules` and are read with `node:fs`, which the browser cannot
 * use. So the reader runs here, on the Node side, and a spec asks for a body through the
 * `goldenMaster` command (`commands.goldenMaster(state, operationId, provider?)` from
 * `vitest/browser`). The provider is `qits-projects` unless named.
 */
const goldenMaster: BrowserCommand<
  [
    state: string,
    operationId: string,
    provider?: 'qits-projects' | 'qits-githost' | 'qits-events' | 'qits-maintenance' | 'qits-edge',
  ]
> = (_context, state, operationId, provider = 'qits-projects') =>
  ({
    'qits-projects': projectsGoldenMasters,
    'qits-githost': githostGoldenMasters,
    'qits-events': eventsGoldenMasters,
    'qits-maintenance': maintenanceGoldenMasters,
    'qits-edge': edgeGoldenMasters,
  })[provider].body(state, operationId);

/**
 * `parkPointer`: moves the mouse to the page's top-left corner. The pointer otherwise stays where
 * the previous test clicked, and over a card it draws a hover ring into the next screenshot.
 */
const parkPointer: BrowserCommand<[]> = async (context) => {
  if (context.provider.name !== 'playwright') return;
  // The Playwright provider gives the command the test's page.
  await (
    context as unknown as { page: { mouse: { move(x: number, y: number): Promise<void> } } }
  ).page.mouse.move(0, 0);
};

/**
 * `stubOrigin`: answers every request to `origin` with a plain grey page, from Playwright, without
 * touching the network. A frame pointed at another application (the editor's) then shows the same
 * pixels on every run, and no remote page is ever loaded. Asking again for the same origin replaces
 * the earlier stub.
 */
const STUB_PAGE =
  '<!doctype html><html><body style="margin:0;height:100vh;background:#e5e7eb"></body></html>';
const stubOrigin: BrowserCommand<[origin: string]> = async (context, origin) => {
  if (context.provider.name !== 'playwright') return;
  type Route = { fulfill(response: { contentType: string; body: string }): Promise<void> };
  const playwrightPage = (
    context as unknown as {
      page: {
        unroute(url: string): Promise<void>;
        route(url: string, handler: (route: Route) => Promise<void>): Promise<void>;
      };
    }
  ).page;
  await playwrightPage.unroute(`${origin}/**`);
  await playwrightPage.route(`${origin}/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: STUB_PAGE }),
  );
};

/**
 * Chromium's flags for the screenshot tests: `--disable-partial-raster`. By default Chromium
 * re-rasters only the invalidated part of a tile, and the antialiased edge of a rounded corner
 * drawn that way can come out one colour step off the whole-tile result (seen on the cards: 2 to
 * 5 pixels, one step in one channel). What gets invalidated first changes from run to run, so the
 * same page gave different pixels. Rastering whole tiles every time makes it the same pixels.
 *
 * Set from a plugin because the Angular builder makes the provider itself: a `browser.provider` in
 * this file is merged into the config, but the browser is launched by the builder's provider, with
 * the builder's options. `configureVitest` runs before any browser starts, so swapping the
 * provider there is what reaches the launch.
 */
const chromiumFlags: Plugin = {
  name: 'qits:chromium-flags',
  configureVitest({ project }) {
    const browser = project.config.browser;
    if (browser.provider?.name !== 'playwright') return;
    browser.provider = playwright({
      ...(browser.provider.options as Parameters<typeof playwright>[0]),
      launchOptions: { args: ['--disable-partial-raster'] },
    });
  },
};

export default defineConfig({
  plugins: [chromiumFlags],
  test: {
    browser: {
      commands: { goldenMaster, parkPointer, stubOrigin },
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
