// The Node-side commands `vitest-browser.config.ts` gives the browser screenshot tests.
import type { RouteRecord } from '@qits/angular/testing/browser';
import 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /**
     * The body `provider` (default qits-projects) recorded for `operationId` in `state`. Specs use
     * `golden-master.ts`, which registers it as a recording.
     */
    goldenMaster: <T = any>(
      state: string,
      operationId: string,
      provider?:
        | 'qits-projects'
        | 'qits-githost'
        | 'qits-events'
        | 'qits-maintenance'
        | 'qits-workspaces'
        | 'qits-ci'
        | 'qits-workspace-daemon'
        | 'qits-system'
        | 'qits-artifacts'
        | 'qits-network-access'
        | 'qits-idp',
    ) => Promise<T>;
    /**
     * The text body `provider` (default qits-projects) recorded for `operationId` in `state`, for
     * an answer recorded as a file (a freeze's HTML, qits-2058). Specs use `goldenMasterText` of
     * `golden-master.ts`, which registers it as a recording.
     */
    goldenMasterText: (
      state: string,
      operationId: string,
      provider?: Parameters<BrowserCommands['goldenMaster']>[2],
    ) => Promise<string>;
    /**
     * Rewrites the running spec's section of the route ledger, `src/testing/browser/routes.json`,
     * with the routes its recorded answers were shown on (`takeRouteRecords()`, in `setup.ts`).
     */
    goldenMasterRoutes: (records: RouteRecord[]) => Promise<void>;
    /** Moves the mouse off the page (past its top-left corner), so no element is hovered. */
    parkPointer: () => Promise<void>;
    /**
     * A real mouse step at (`x`, `y`) in the test page's viewport: `move` there (in `steps`
     * moves), or move there and press (`down`) or release (`up`) the left button.
     */
    mouse: (action: 'move' | 'down' | 'up', x: number, y: number, steps?: number) => Promise<void>;
    /**
     * A real touch step of one finger at (`x`, `y`) in the test page's viewport: `down` puts it
     * there, `move` slides it there (in `steps` moves), `up` lifts it there, `cancel` has the
     * browser abandon the touch. Does nothing while no finger is down, except `down`.
     */
    touch: (
      action: 'down' | 'move' | 'up' | 'cancel',
      x: number,
      y: number,
      steps?: number,
    ) => Promise<void>;
    /** Answers every request matching `pattern` with a plain grey image, without the network. */
    stubFigure: (pattern: string) => Promise<void>;
  }
}
