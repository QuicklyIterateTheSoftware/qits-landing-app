import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, type EnvironmentProviders, type Provider, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS } from '@qits/angular';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { artifactsGoldenMasters as masters, ENTITY_MAP_STATE } from './golden-masters';
import { provideTestPlatformOrigins } from './platform-origins';

/**
 * The plain specs of a repository's contracts and entities pages (qits-1994): the page at its own
 * route, the spec's artifacts client, a docs origin for the bundle's link, and an event stream that never
 * connects. The bundle is qits-artifacts' recording of `a published contracts bundle with an
 * entity map`: `@contracts/qits-projects` at 2100.1.0, naming `qits-projects-service`.
 */

/** The generated client builds its request after a few awaits; let them run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve));

export const CONTRACTS = ENTITY_MAP_STATE;
export const SLUG = 'qits';
export const REPO = 'qits-projects-service';
export const { site: SITE, version: VERSION } = masters.operation(CONTRACTS, 'getDocsFile').params;
export const SITES_URL = '/artifacts/docs/docs';
export const VERSIONS_URL = `${SITES_URL}/${SITE}`;
export const DOCS = 'https://docs.example';

/**
 * Sets the testing module up for `page` at `path`. `client` is the spec's artifacts client setup
 * (`provideHeyApiClient(artifactsClient)`, with `literalDocsPaths` on it, as `app.config.ts` does):
 * only stores and specs import a generated client.
 */
export function configureContractsPage(
  path: string,
  page: Type<unknown>,
  client: Provider | EnvironmentProviders,
): HttpTestingController {
  const routes: Routes = [{ path, component: page }];
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      provideRouter(routes),
      provideHttpClient(),
      provideHttpClientTesting(),
      client,
      provideTestPlatformOrigins({}, { docs: DOCS }),
      {
        provide: EVENT_SOURCE,
        useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
      },
      // The services' resources read the app's one stream, as `app.config.ts` provides it.
      { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

/**
 * The recorded versions of the contracts site, its version renamed `version`: a case that must see
 * a read of its own (a failure) reads a version no other case reads.
 */
export function versionsAt(version: string) {
  const body = masters.body<{ versions: { version: string }[] }>(CONTRACTS, 'listDocsVersions');
  return { ...body, versions: body.versions.map((v) => ({ ...v, version })) };
}

/**
 * Opens `url` and answers the catalog with the recorded contracts site and its versions (or
 * `versions`; `'error'` fails the read).
 */
export async function openContractsPage(
  http: HttpTestingController,
  url: string,
  versions: object | 'error' = masters.body(CONTRACTS, 'listDocsVersions'),
) {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const update = async () => {
    await settle();
    harness.detectChanges();
    await settle();
    harness.detectChanges();
  };
  await update();
  http.expectOne(SITES_URL).flush(masters.body(CONTRACTS, 'listDocsSites'));
  await update();
  const versionsRead = http.expectOne(VERSIONS_URL);
  if (versions === 'error') versionsRead.flush(null, { status: 500, statusText: 'Server Error' });
  else versionsRead.flush(versions);
  await update();
  const element = harness.routeNativeElement as HTMLElement;
  /**
   * Answers every open read of `file` in the site's version with `body`, or with `status`.
   */
  const answer = async (file: string, body: unknown, at = VERSION, status = 200) => {
    for (const req of http.match(`${VERSIONS_URL}/-/${at}/${file}`)) {
      if (status >= 400) req.flush(null, { status, statusText: 'Error' });
      else req.flush(body as object);
    }
    await update();
  };
  return { harness, element, update, answer };
}

/**
 * An element's text: each text node's, trimmed, joined by single spaces (the templates drop the
 * whitespace between elements, so `textContent` runs them together).
 */
export function text(element: Element | null | undefined): string {
  if (!element) return '';
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const part = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (part) parts.push(part);
  }
  return parts.join(' ');
}
