import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';
import { defineConfig } from 'vitest/config';
import { screenshotReferences } from '@qits/angular/screenshots';
import { goldenMasterRoutes, pactedGoldenMasters } from '@qits/angular/testing';
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
 * `goldenMasterRoutes`: keeps the route ledger, `src/testing/browser/routes.json` (ticket qits-1946).
 * After each spec file, `setup.ts` sends what the golden-master guard noted, which recorded answer
 * the spec showed on which route, and this rewrites that spec's section. The pact specs read the
 * ledger (`src/testing/golden-masters.ts`), so every interaction names the routes it happens on
 * (`qits-trigger.route`). The root is this file's directory, so the sections are keyed by the spec's
 * path in this repository (`src/app/routes/…`) whatever directory the run starts in.
 *
 * Only a page spec's routes are kept: it mounts the page at the route its directory names, which
 * the lint rule holds to the app's. A layout or pattern spec mounts a stand-in route of its own
 * (`projects/:slug/:view/:qualifiedId`) that no user ever opens, so its section stays empty.
 */
const ledger = goldenMasterRoutes(
  'src/testing/browser/routes.json',
  fileURLToPath(new URL('.', import.meta.url)),
);
const PAGE_SPEC = /\.page\.browser\.spec\.ts$/;
const routes: typeof ledger = (context, records) =>
  ledger(context, PAGE_SPEC.test(context.testPath ?? '') ? records : []);

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

/** The Playwright side of a command's context, as far as the pointer commands use it. */
type PlaywrightContext = {
  page: {
    mouse: {
      move(x: number, y: number, options?: { steps?: number }): Promise<void>;
      down(): Promise<void>;
      up(): Promise<void>;
    };
    context(): { newCDPSession(page: unknown): Promise<CdpSession> };
  };
  frame(): Promise<{
    frameElement(): Promise<{
      boundingBox(): Promise<{ x: number; y: number; width: number } | null>;
    }>;
    evaluate<T>(fn: () => T): Promise<T>;
  }>;
};

type CdpSession = { send(method: string, params?: object): Promise<unknown> };

/**
 * The point (`x`, `y`) of the test page's own viewport (CSS px) on Playwright's page. The test page
 * is an iframe of Vitest's own page, so the point is shifted (and scaled) by where that iframe sits.
 */
async function onPage(playwright: PlaywrightContext, x: number, y: number) {
  const frame = await playwright.frame();
  const box = await (await frame.frameElement()).boundingBox();
  const width = await frame.evaluate(() => window.innerWidth);
  const scale = box && width ? box.width / width : 1;
  return { x: (box?.x ?? 0) + x * scale, y: (box?.y ?? 0) + y * scale };
}

/**
 * `mouse`: one real, trusted mouse step from Playwright at (`x`, `y`) in the test page's own
 * viewport (CSS px): `move` there (in `steps` intermediate moves, 1 unless given), or move there
 * and press (`down`) or release (`up`) the left button. Synthetic `PointerEvent`s cannot set a
 * pointer capture, so a drag spec needs these.
 */
const mouse: BrowserCommand<
  [action: 'move' | 'down' | 'up', x: number, y: number, steps?: number]
> = async (context, action, x, y, steps = 1) => {
  if (context.provider.name !== 'playwright') return;
  const playwright = context as unknown as PlaywrightContext;
  const at = await onPage(playwright, x, y);
  const pointer = playwright.page.mouse;
  await pointer.move(at.x, at.y, { steps });
  if (action === 'down') await pointer.down();
  if (action === 'up') await pointer.up();
};

/** Each page's DevTools session, and where its one finger is (page px), while it is down. */
const touchSessions = new WeakMap<object, { cdp: CdpSession; at?: { x: number; y: number } }>();

/**
 * `touch`: one real, trusted touch step with one finger at (`x`, `y`) in the test page's own
 * viewport (CSS px), through Chromium's DevTools protocol (`Input.dispatchTouchEvent`), which
 * Playwright's own touchscreen cannot do short of a tap: `down` puts the finger there, `move`
 * slides it there in `steps` moves (1 unless given), `up` lifts it there, and `cancel` has the
 * browser abandon the touch (a `pointercancel`). The page sees `pointerType` `touch` events it
 * can capture, as from a phone.
 */
const touch: BrowserCommand<
  [action: 'down' | 'move' | 'up' | 'cancel', x: number, y: number, steps?: number]
> = async (context, action, x, y, steps = 1) => {
  if (context.provider.name !== 'playwright') return;
  const playwright = context as unknown as PlaywrightContext;
  let session = touchSessions.get(playwright.page);
  if (!session) {
    session = { cdp: await playwright.page.context().newCDPSession(playwright.page) };
    touchSessions.set(playwright.page, session);
  }
  const at = await onPage(playwright, x, y);
  const send = (type: string, points: { x: number; y: number }[]) =>
    session.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point) => ({ ...point, id: 1, radiusX: 1, radiusY: 1, force: 1 })),
    });
  if (action === 'down') {
    await send('touchStart', [at]);
    session.at = at;
    return;
  }
  const from = session.at;
  if (!from) return;
  if (action === 'cancel') {
    await send('touchCancel', []);
    session.at = undefined;
    return;
  }
  for (let i = 1; i <= steps; i++) {
    const point = {
      x: from.x + ((at.x - from.x) * i) / steps,
      y: from.y + ((at.y - from.y) * i) / steps,
    };
    if (point.x !== session.at?.x || point.y !== session.at?.y) await send('touchMove', [point]);
    session.at = point;
  }
  if (action === 'up') {
    await send('touchEnd', []);
    session.at = undefined;
  }
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
  // `freezes`: writes every passing screenshot as HTML to src/testing/browser/freezes/ (qits-1947),
  // naming the route only for the page specs (`*.page.browser.spec.ts`), as the route ledger does.
  plugins: [chromiumFlags, screenshotReferences({ freezes: true })],
  test: {
    // Vitest 5 moved the default to .vitest/attachments; keep the ignored path the docs name.
    attachmentsDir: '.vitest-attachments',
    browser: {
      commands: {
        goldenMaster,
        goldenMasterRoutes: routes,
        parkPointer,
        mouse,
        touch,
        stubFigure,
      },
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
