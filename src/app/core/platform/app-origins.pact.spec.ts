import { PLATFORM_ID } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { PactV4 } from '@pact-foundation/pact';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { addGoldenInteraction, assertPactFile } from '@qits/angular/testing';
import { edgeGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  AppOrigins,
  BACKEND_APPS,
  PAGE_APPS,
  PAGE_HOSTNAME,
  SAME_ORIGIN_APIS,
} from './app-origins';

/**
 * qits-landing-app's pact with qits-edge-service (epic qits-112), in
 * `pacts/qits-landing-app_qits-edge-service.json`.
 *
 * `AppOrigins` reads `GET /main-navigation` once, when the app starts. The pact binds
 * `applications.<app>.origin` of each application under its current name (the first in
 * `BACKEND_APPS` and `PAGE_APPS`; the old `qits-platform-…` names are a fallback the recording
 * does not hold), and the navigation's own `origin`, which names the domain under `ng serve`.
 */
const CONSUMER = 'qits-landing-app';
const PROVIDER = 'qits-edge-service';
const COMMITTED = resolve(process.cwd(), `pacts/${CONSUMER}_${PROVIDER}.json`);

/** The recording's host is `projects.qits.example.com`, so its applications are under this. */
const DOMAIN = 'qits.example.com';

const NAMES = Object.values({ ...BACKEND_APPS, ...PAGE_APPS }).map(([name]) => name);
const READ_NAVIGATION = ['origin', ...NAMES.map((name) => `applications.${name}.origin`)];

const dir = mkdtempSync(join(tmpdir(), 'qits-landing-pact-'));
const pact = new PactV4({ consumer: CONSUMER, provider: PROVIDER, dir, logLevel: 'warn' });

/** `AppOrigins` in a deployed browser page on {@link DOMAIN}, its requests sent to `url`. */
function originsAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: SAME_ORIGIN_APIS, useValue: false },
      { provide: PAGE_HOSTNAME, useValue: DOMAIN },
      provideHttpClient(
        withFetch(),
        withInterceptors([(request, next) => next(request.clone({ url: url + request.url }))]),
      ),
    ],
  });
  return TestBed.inject(AppOrigins);
}

describe('qits-landing-app → qits-edge-service pact', () => {
  afterAll(() => {
    try {
      assertPactFile(join(dir, `${CONSUMER}-${PROVIDER}.json`), COMMITTED, 'QITS_GOLDEN_UPDATE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('load-app-origins: every application has its origin', () =>
    addGoldenInteraction(pact, masters, {
      provider: PROVIDER,
      state: 'a published navigation',
      operationId: 'getMainNavigation',
      trigger: { kind: 'ui', app: CONSUMER, interaction: 'load-app-origins' },
      consumes: READ_NAVIGATION,
    }).executeTest(async (server) => {
      const origins = originsAt(server.url);
      await origins.load();
      expect(origins.failed()).toBe(false);
      expect(origins.origin('projects')).toBe(`https://projects.${DOMAIN}`);
      expect(origins.origin('workspaces')).toBe(`https://workspaces.${DOMAIN}`);
    }));
});
