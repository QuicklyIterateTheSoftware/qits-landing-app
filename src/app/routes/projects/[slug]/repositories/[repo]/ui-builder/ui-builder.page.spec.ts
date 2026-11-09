import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { client as artifactsClient } from '../../../../../../api/artifacts/client.gen';
import { provideHeyApiClient as provideArtifactsClient } from '../../../../../../api/artifacts/client/client.gen';
import { client as projectsClient } from '../../../../../../api/projects/client.gen';
import { provideHeyApiClient } from '../../../../../../api/projects/client/client.gen';
import { EVENT_SOURCE } from '$core/events/domain-events';
import { SelectedProject } from '$core/projects/selected-project';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import {
  artifactsGoldenMasters as artifacts,
  goldenMaster,
} from '../../../../../../../testing/golden-masters';
import { provideTestPlatformOrigins } from '../../../../../../../testing/platform-origins';
import { UiBuilderPage } from './ui-builder.page';

const settle = () => new Promise((resolve) => setTimeout(resolve));

/** The recorded project's id: every state seeds its project under this frozen id. */
const ID = '00000000-0000-4000-8000-000000000001';
const BUNDLE = 'a published routes bundle';
const { site: SITE, version: VERSION } = artifacts.operation(BUNDLE, 'getDocsFile').params;
const SITES_URL = '/artifacts/docs/docs';
const VERSIONS_URL = `/artifacts/docs/docs/${SITE}`;
const VERSION_URL = `${VERSIONS_URL}/-/${VERSION}`;
const fileUrl = (file: string) =>
  `${VERSION_URL}/${file.split('/').map(encodeURIComponent).join('/')}`;
const LOADED_FREEZE = artifacts.operation('a published routes bundle freeze', 'getDocsFile').params[
  'path'
];
/** `projects/:slug/repositories`'s freezes by name: `error`, then `loaded`. */
const ERROR_FREEZE = LOADED_FREEZE.replace(/loaded\.html$/, 'error.html');

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal.
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

/** The recorded version list, its newest version naming `repo` instead (a frontend's own site). */
function versionsNaming(repo: string) {
  const body = artifacts.body<{ versions: { metadata: Record<string, string> }[] }>(
    BUNDLE,
    'listDocsVersions',
  );
  return {
    ...body,
    versions: body.versions.map((v) => ({
      ...v,
      metadata: { ...v.metadata, 'git.repository.name': repo },
    })),
  };
}

describe('UiBuilderPage', () => {
  let http: HttpTestingController;
  const SLUG = 'contract-00000001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([
          { path: 'projects/:slug/repositories/:repo/ui-builder', component: UiBuilderPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
        provideArtifactsClient(artifactsClient),
        provideTestPlatformOrigins({}),
        {
          provide: EVENT_SOURCE,
          useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
        },
        {
          provide: SelectedProject,
          useValue: { project: signal({ id: ID }), slug: signal(SLUG), url: signal('') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The page for `repo` at the router, `query` appended to its address. */
  async function open(repo: string, query = '') {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(
      `/projects/${SLUG}/repositories/${repo}/ui-builder${query}`,
      UiBuilderPage,
    );
    harness.detectChanges();
    await settle();
    http
      .expectOne(`/projects/api/projects/${ID}/repositories`)
      .flush(goldenMaster('a project with repositories in components', 'listProjectRepositories'));
    return { harness, page, fixture: harness.fixture };
  }

  /** The page for `repo`, with the bundle found for it and the project's repositories read. */
  async function render(
    repo: string,
    versions: object = artifacts.body(BUNDLE, 'listDocsVersions'),
    query = '',
  ) {
    const { harness, page, fixture } = await open(repo, query);
    http.expectOne(SITES_URL).flush(artifacts.body(BUNDLE, 'listDocsSites'));
    await settle();
    http.expectOne(VERSIONS_URL).flush(versions);
    await settle();
    http.expectOne(fileUrl('manifest.json')).flush(artifacts.body(BUNDLE, 'getDocsFile'));
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    // An element's text, its parts (spans, or the whole) joined by single spaces.
    const texts = (selector: string) =>
      [...element.querySelectorAll(selector)].map((e) => {
        const parts = e.querySelectorAll('span');
        const words = parts.length ? [...parts].map((p) => p.textContent ?? '') : [e.textContent];
        return words.map((w) => (w ?? '').replace(/\s+/g, ' ').trim()).join(' ');
      });
    return { fixture, element, texts, page };
  }

  /** Answers the selected freeze (empty: the recording has no body) and the bundle's assets. */
  async function answerFreeze(
    file: string,
    fixture: { detectChanges(): void; whenStable(): Promise<unknown> },
  ) {
    await settle();
    http.expectOne(fileUrl(file)).flush('<a href="/projects/x">x</a>');
    http.expectOne(VERSION_URL).flush(artifacts.body(BUNDLE, 'getDocsVersion'));
    await settle();
    http
      .expectOne(fileUrl('assets/inter-latin-400-normal.woff2'))
      .flush(new Blob([], { type: 'font/woff2' }));
    for (let i = 0; i < 10; i++) await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Lets a navigation the page started finish, and draws its outcome. */
  async function navigated(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    for (let i = 0; i < 3; i++) await settle();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Hands `page` a frame holding `html`; the result clicks what a selector finds and says whether
   * the click was cancelled.
   */
  function frameWith(page: UiBuilderPage, html: string) {
    const doc = document.implementation.createHTMLDocument('freeze');
    doc.body.innerHTML = html;
    const frame = { contentDocument: doc } as unknown as HTMLIFrameElement;
    (page as unknown as { holdLinks(e: Event): void }).holdLinks({
      target: frame,
    } as unknown as Event);
    return (selector: string) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      doc.querySelector(selector)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
  }

  const query = () => TestBed.inject(Router).parseUrl(TestBed.inject(Router).url).queryParams;

  it('lays the routes out, opens the first route with states, and frames its first state', async () => {
    const { fixture, element, texts } = await render('qits-landing-app');
    expect(texts('nav button.route')).toEqual([
      '/ → projects',
      'projects 0',
      ':slug',
      'repositories 2',
      'workspaces → projects/:slug/agents',
      '**',
    ]);
    const disabled = [...element.querySelectorAll<HTMLButtonElement>('nav button.route')].map(
      (b) => b.disabled,
    );
    expect(disabled).toEqual([true, false, true, false, true, true]);
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(texts('[role="tab"]')).toEqual(['error', 'loaded']);
    expect(element.querySelector('.frame-placeholder')?.textContent).toContain('Reading');
    expect(texts('li.call')).toEqual([
      'listProjectRepositories qits-projects-service · “a project with repositories”',
      'listProjects qits-projects-service · “a project exists”',
    ]);

    await answerFreeze(ERROR_FREEZE, fixture);
    const frame = element.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('allow-same-origin');
    expect(element.innerHTML).not.toContain('allow-scripts');
    expect(element.querySelector('.link-notice')).toBeNull();
  });

  it('reads the state a tab picks, and resets the tab when the route changes', async () => {
    const { fixture, element, texts } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    element.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await navigated(fixture);
    expect(query()).toEqual({ state: 'loaded' });
    http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
    await settle();
    fixture.detectChanges();
    expect(element.querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe('loaded');

    const projects = [...element.querySelectorAll<HTMLButtonElement>('nav button.route')].find(
      (b) => b.textContent?.replace(/\s+/g, '') === 'projects0',
    )!;
    projects.click();
    await navigated(fixture);
    expect(query()).toEqual({ route: 'projects' });
    expect(element.querySelector('h2')?.textContent).toBe('/projects');
    expect(element.querySelector('.no-states')?.textContent).toContain(
      'No screenshot test for this route, so nothing is frozen.',
    );
    expect(texts('aside li')).toEqual(['Its spec answers no request.']);
  });

  it('opens the route and the state the URL names', async () => {
    const { fixture, element } = await render(
      'qits-landing-app',
      undefined,
      '?route=projects%2F%3Aslug%2Frepositories&state=loaded',
    );
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(element.querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe('loaded');
    await answerFreeze(LOADED_FREEZE, fixture);
  });

  it('opens the first route with states for a route the tree does not have', async () => {
    const { fixture, element } = await render('qits-landing-app', undefined, '?route=nowhere');
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(element.querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe('error');
    await answerFreeze(ERROR_FREEZE, fixture);
  });

  it('covers every service for the project’s landing app', async () => {
    const { fixture, element, texts } = await render(
      'contract-00000001-landing-app',
      versionsNaming('contract-00000001-landing-app'),
    );
    await answerFreeze(ERROR_FREEZE, fixture);
    expect(element.querySelector('.scope')?.textContent).toBe('Scope: all services');
    expect(texts('li.call')).toHaveLength(2);
    expect(element.querySelector('.hidden-calls')).toBeNull();
  });

  it('shows another frontend only its own component’s calls, and says how many it hid', async () => {
    const { fixture, element, texts } = await render(
      'contract-frontend',
      versionsNaming('contract-frontend'),
    );
    await answerFreeze(ERROR_FREEZE, fixture);
    expect(element.querySelector('.scope')?.textContent).toBe('Scope: contract');
    expect(texts('li.call')).toEqual([]);
    expect(element.querySelector('.hidden-calls')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Hid 2 calls to providers outside contract.',
    );
  });

  it('says so when no frozen routes are published for the repository', async () => {
    const { harness, fixture } = await open('contract-frontend');
    http.expectOne(SITES_URL).flush(artifacts.body('a published docs site', 'listDocsSites'));
    await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    expect(element.querySelector('.none')?.textContent?.trim()).toBe(
      'No frozen routes published for contract-frontend.',
    );
    expect(element.querySelector('nav')).toBeNull();
  });

  it('cancels a link click inside the frame and selects the route it leads to', async () => {
    const { fixture, element, page } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    const click = frameWith(page, '<a href="/projects?x=1#top"><span>x</span></a><p>text</p>');
    expect(click('p')).toBe(false);
    expect(click('span')).toBe(true);
    await navigated(fixture);
    expect(query()).toEqual({ route: 'projects' });
    expect(element.querySelector('[aria-current="page"]')?.textContent?.replace(/\s+/g, '')).toBe(
      'projects0',
    );
    expect(element.querySelector('h2')?.textContent).toBe('/projects');
  });

  it('keeps the route on a link outside the app, and says where it leads', async () => {
    const { fixture, element, page } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    const click = frameWith(page, '<a href="https://ci.qits.wohlben.eu/x">ci</a>');
    expect(click('a')).toBe(true);
    await navigated(fixture);
    expect(query()).toEqual({});
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(element.querySelector('.link-notice')?.textContent?.trim()).toBe(
      'Leads outside the app: https://ci.qits.wohlben.eu/x',
    );
  });

  it('keeps the route on a link no route matches, says so, and forgets it on the next pick', async () => {
    const { fixture, element, page } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    const click = frameWith(page, '<a href="/w?q#f">w</a><a href="#f4" class="fragment">f</a>');
    expect(click('a')).toBe(true);
    await navigated(fixture);
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(element.querySelector('.link-notice')?.textContent?.trim()).toBe(
      'No route of this app matches /w',
    );
    expect(click('.fragment')).toBe(true);
    await navigated(fixture);
    expect(element.querySelector('.link-notice')).not.toBeNull();

    element.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await navigated(fixture);
    http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
    expect(element.querySelector('.link-notice')).toBeNull();
  });
});
