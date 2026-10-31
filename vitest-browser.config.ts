import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { screenshotReferences } from '@qits/angular/screenshots';
import { pactedGoldenMasters } from '@qits/angular/testing';
import {
  ciGoldenMasters,
  eventsGoldenMasters,
  githostGoldenMasters,
  maintenanceGoldenMasters,
  projectsGoldenMasters,
  systemGoldenMasters,
  workspaceDaemonGoldenMasters,
  workspacesGoldenMasters,
} from './src/testing/golden-masters';

/** The pact this app holds with `repository`, the provider whose golden masters a reader reads. */
const pactWith = (repository: string) => `pacts/qits-landing-app_${repository}.json`;

/**
 * Each provider's golden masters, as the browser screenshot tests may read them: only a (state,
 * operation) an interaction in the committed pact uses, so the provider verifies every body a
 * screenshot shows (`pactedGoldenMasters`).
 */
const READERS = {
  'qits-projects': pactedGoldenMasters(projectsGoldenMasters, pactWith('qits-projects-service')),
  'qits-githost': pactedGoldenMasters(githostGoldenMasters, pactWith('qits-githost-service')),
  'qits-events': pactedGoldenMasters(eventsGoldenMasters, pactWith('qits-events-service')),
  'qits-maintenance': pactedGoldenMasters(
    maintenanceGoldenMasters,
    pactWith('qits-maintenance-service'),
  ),
  'qits-workspaces': pactedGoldenMasters(
    workspacesGoldenMasters,
    pactWith('qits-workspaces-service'),
  ),
  'qits-ci': pactedGoldenMasters(ciGoldenMasters, pactWith('qits-ci-service')),
  'qits-workspace-daemon': pactedGoldenMasters(
    workspaceDaemonGoldenMasters,
    pactWith('qits-workspace-daemon'),
  ),
  'qits-system': pactedGoldenMasters(systemGoldenMasters, pactWith('qits-system-service')),
};

/**
 * The golden masters live in `node_modules` and are read with `node:fs`, which the browser cannot
 * use. So the reader runs here, on the Node side, and the browser asks for a body through the
 * `goldenMaster` command. Specs never call the command themselves: they use
 * `src/testing/browser/golden-master.ts`, which registers every body as a recording. The provider
 * is `qits-projects` unless named.
 */
const goldenMaster: BrowserCommand<
  [state: string, operationId: string, provider?: keyof typeof READERS]
> = (_context, state, operationId, provider = 'qits-projects') =>
  READERS[provider].body(state, operationId);

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
 * `mouse`: one real, trusted mouse step from Playwright at (`x`, `y`) in the test page's own
 * viewport (CSS px): `move` there (in `steps` intermediate moves, 1 unless given), or move there
 * and press (`down`) or release (`up`) the left button. Synthetic `PointerEvent`s cannot set a
 * pointer capture, so a drag spec needs these. The test page is an iframe of Vitest's own page,
 * so the point is shifted (and scaled) by where that iframe sits.
 */
const mouse: BrowserCommand<
  [action: 'move' | 'down' | 'up', x: number, y: number, steps?: number]
> = async (context, action, x, y, steps = 1) => {
  if (context.provider.name !== 'playwright') return;
  type Mouse = {
    move(x: number, y: number, options?: { steps?: number }): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
  };
  type Frame = {
    frameElement(): Promise<{
      boundingBox(): Promise<{ x: number; y: number; width: number } | null>;
    }>;
    evaluate<T>(fn: () => T): Promise<T>;
  };
  const playwright = context as unknown as { page: { mouse: Mouse }; frame(): Promise<Frame> };
  const frame = await playwright.frame();
  const box = await (await frame.frameElement()).boundingBox();
  const width = await frame.evaluate(() => window.innerWidth);
  const scale = box && width ? box.width / width : 1;
  const at = { x: (box?.x ?? 0) + x * scale, y: (box?.y ?? 0) + y * scale };
  const pointer = playwright.page.mouse;
  await pointer.move(at.x, at.y, { steps });
  if (action === 'down') await pointer.down();
  if (action === 'up') await pointer.up();
};

/**
 * `stubFigure`: answers every request matching `pattern` (a Playwright URL glob) with a plain grey
 * 480x160 SVG, from Playwright, without touching the network. An image a page loads from a backend
 * (an epic's dossier figure, whose bytes no golden master records) then shows the same pixels on
 * every run. Asking again for the same pattern replaces the earlier stub.
 */
const FIGURE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160"><rect width="480" height="160" fill="#d1d5db"/></svg>';
const stubFigure: BrowserCommand<[pattern: string]> = async (context, pattern) => {
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
  await playwrightPage.unroute(pattern);
  await playwrightPage.route(pattern, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: FIGURE }),
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
  // screenshotReferences: records the reference screenshots each spec asks for, so
  // `qits-angular screenshots --check` (after the run, in `test:browser`) finds the ones no test uses.
  plugins: [chromiumFlags, screenshotReferences()],
  test: {
    // Vitest 5 moved the default to .vitest/attachments; keep the ignored path the docs name.
    attachmentsDir: '.vitest-attachments',
    browser: {
      commands: { goldenMaster, parkPointer, mouse, stubFigure },
      // Vitest 5 made text locators exact by default. The specs locate by substring, as in vitest 4.
      locators: { exact: false },
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
