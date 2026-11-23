import { bootstrapAppScopedEarlyEventContract } from '@angular/core/primitives/event-dispatch';
import { renderApplication } from '@angular/platform-server';
import bootstrap from './main.server';

/**
 * The server render of the contracts and entities pages, through the server bootstrap and its
 * hydration annotations (qits-2504: the entity page threw NG0502 while the serializer annotated a
 * projected `@let` its frame never inserted; `ContractsFrame`). The bundle is still loading when
 * the render settles, so each page renders its frame's spinner.
 *
 * Two things differ from the real server bundle, which defines `ngServerMode` before any module.
 * Here `app.config.ts` evaluates outside server mode (under this spec's own imports, or an earlier
 * spec's: `ng test` shares modules between specs), so `provideClientHydration()` carries the
 * browser's event replay providers too, and once the render is stable they replay the early event
 * contract the server's HTML bootstraps in a browser (`window._ejsas`). Nothing bootstraps it in
 * jsdom, so each test does, the way that inline script would. And importing the server config
 * sets `ngServerMode` for good (`provideServerRendering`), so it is removed after the suite.
 */
const ROUTES = [
  '/projects/qits/components/qits-projects-service/entities',
  '/projects/qits/components/qits-projects-service/entities/eu.wohlben.Some',
  '/projects/qits/components/qits-projects-service/contracts',
  '/projects/qits/components/qits-projects-service/contracts/some-state',
];

type Globals = { ngServerMode?: boolean; _ejsas?: unknown };

describe('server render', () => {
  beforeAll(() => ((globalThis as Globals).ngServerMode = true));
  afterAll(() => {
    delete (globalThis as Globals).ngServerMode;
    delete (window as Globals)._ejsas;
  });

  // The app's id is the default one (`APP_ID`, 'ng').
  beforeEach(() => bootstrapAppScopedEarlyEventContract(document.body, 'ng', [], []));

  for (const url of ROUTES) {
    it(`renders ${url} with hydration annotations`, async () => {
      const html = await renderApplication(bootstrap, {
        document: '<!doctype html><html><head></head><body><app-root></app-root></body></html>',
        url,
      });
      expect(html).toContain('ngh=');
    });
  }
});
