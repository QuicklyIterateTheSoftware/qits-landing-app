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
import type {
  DeclaredOutcome,
  FiredOutcome,
  RoutesManifest,
} from '$core/ui-builder/routes-manifest';
import {
  artifactsGoldenMasters as artifacts,
  ENTITY_MAP_STATE as CONTRACTS,
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

const REPOSITORIES = 'projects/:slug/repositories';
const SPEC =
  'src/app/routes/projects/[slug]/repositories/project-repositories.page.browser.spec.ts';

/** A page outcome of the repositories route (qits-2006). */
const declared = (
  outcome: string,
  kind: 'exit' | 'stay',
  to: string | null = null,
): DeclaredOutcome => ({
  route: REPOSITORIES,
  interaction: 'repositories',
  outcome,
  kind,
  to,
  global: false,
  file: 'src/app/routes/projects/[slug]/repositories/project-repositories.page.ts',
});

/** A fire of `interaction:outcome` by `test` on the repositories route, shot as `freeze`. */
const fired = (
  test: string,
  interaction: string,
  outcome: string,
  freeze: string | null = null,
): FiredOutcome => ({
  spec: SPEC,
  test,
  route: REPOSITORIES,
  interaction,
  outcome,
  kind: 'stay',
  freeze,
});

/**
 * The recorded manifest with outcomes (qits-2006): the repositories route exits to `projects`
 * (its trigger in `error`) and to no route, is refused (fired, shot in `loaded`, its trigger in
 * `loaded` only) and declares one outcome nothing reaches; the root layout and the app declare one
 * each. `outcomes` replaces the section.
 */
function withOutcomes(outcomes: unknown = OUTCOMES): RoutesManifest {
  const recorded = artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile');
  const triggers: Record<string, string[]> = {
    [ERROR_FREEZE]: ['repositories:opened', 'shell:signed-out'],
    [LOADED_FREEZE]: ['repositories:refused', 'shell:signed-out'],
  };
  return {
    ...recorded,
    freezes: recorded.freezes.map((freeze) =>
      triggers[freeze.file] ? { ...freeze, triggers: triggers[freeze.file] } : freeze,
    ),
    outcomes: outcomes as RoutesManifest['outcomes'],
  };
}

const OUTCOMES = {
  declared: [
    declared('refused', 'stay'),
    declared('opened', 'exit', 'projects'),
    declared('lost', 'exit', 'nowhere'),
    declared('unreached', 'stay'),
    {
      route: '',
      interaction: 'shell',
      outcome: 'signed-out',
      kind: 'exit',
      to: 'projects',
      global: true,
      file: 'src/app/layout/shell/shell.layout.ts',
    },
    {
      route: null,
      interaction: 'toasts',
      outcome: 'dismissed',
      kind: 'stay',
      to: null,
      global: true,
      file: 'src/app/patterns/toasts/toasts.ts',
    },
  ] satisfies DeclaredOutcome[],
  fired: [
    fired('opens a project', 'repositories', 'opened'),
    fired('lists the project’s repositories', 'repositories', 'refused', LOADED_FREEZE),
    fired('signs out', 'shell', 'signed-out'),
  ],
};

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

/** An element's text: its child elements' texts (or its own, without any) joined by spaces. */
function words(element: Element): string {
  const parts = element.children.length ? [...element.children] : [element];
  return parts
    .map((part) => (part.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

/** Clicks the left panel's tab named `name`. */
function clickTab(element: HTMLElement, name: string): void {
  [...element.querySelectorAll<HTMLButtonElement>('[aria-label="Panels"] [role="tab"]')]
    .find((tab) => tab.textContent?.trim() === name)!
    .click();
}

describe('UiBuilderPage', () => {
  let http: HttpTestingController;
  const SLUG = 'contract-00000001';
  /** The recorded map's Project, on its entity page in the project (qits-1994). */
  const PROJECT_PAGE = `/projects/${SLUG}/repositories/qits-projects-service/entities/eu.wohlben.qits.entities.domain.Project`;

  /** The testing module, as every case starts with it. */
  function configure() {
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
  }

  beforeEach(configure);

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
    answerEntities: () => Promise<void> = answerNoContracts,
    query = '',
    manifest: object = artifacts.body(BUNDLE, 'getDocsFile'),
  ) {
    const { harness, page, fixture } = await open(repo, query);
    http.expectOne(SITES_URL).flush(artifacts.body(BUNDLE, 'listDocsSites'));
    await settle();
    http.expectOne(VERSIONS_URL).flush(versions);
    await settle();
    http.expectOne(fileUrl('manifest.json')).flush(manifest);
    await settle();
    fixture.detectChanges();
    await settle();
    await answerEntities();
    for (let i = 0; i < 5; i++) await settle();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = harness.routeNativeElement as HTMLElement;
    // An element's text, its non-empty parts (spans, or the whole) joined by single spaces.
    const texts = (selector: string) =>
      [...element.querySelectorAll(selector)].map((e) => {
        const parts = e.querySelectorAll('span');
        const words = parts.length ? [...parts].map((p) => p.textContent ?? '') : [e.textContent];
        return words
          .map((w) => (w ?? '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' ');
      });
    return { fixture, element, texts, page };
  }

  /** Answers the entity maps' catalog with the bundle's: `@routes/qits-landing`, no contracts site. */
  async function answerNoContracts() {
    http.expectOne(SITES_URL).flush(artifacts.body(BUNDLE, 'listDocsSites'));
  }

  /** Answers the catalog, the contracts site's versions, and its `entities.json` with `map`. */
  function answerContracts(map: (read: { flush(body: unknown, opts?: object): void }) => void) {
    return async () => {
      const { site, version } = artifacts.operation(CONTRACTS, 'getDocsFile').params;
      http.expectOne(SITES_URL).flush(artifacts.body(CONTRACTS, 'listDocsSites'));
      await settle();
      http.expectOne(`${SITES_URL}/${site}`).flush(artifacts.body(CONTRACTS, 'listDocsVersions'));
      for (let i = 0; i < 3; i++) await settle();
      map(http.expectOne(`${SITES_URL}/${site}/-/${version}/entities.json`));
    };
  }

  const recordedMap = answerContracts((read) =>
    read.flush(artifacts.body(CONTRACTS, 'getDocsFile')),
  );

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
    expect(texts('nav .route-row')).toEqual([
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
    expect(texts('[aria-label="States"] [role="tab"]')).toEqual(['error', 'loaded']);
    expect(texts('[aria-label="Panels"] [role="tab"]')).toEqual(['Routes', 'Entities', 'Outcomes']);
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

  it('folds a parent row’s children with the number at its end, and unfolds them again', async () => {
    const { fixture, element, texts } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    const fold = (text: string) =>
      [...element.querySelectorAll<HTMLElement>('nav .route-row')]
        .find((row) => row.textContent?.replace(/\s+/g, '') === text)!
        .querySelector<HTMLButtonElement>('button.fold')!;
    expect(fold('projects0').getAttribute('aria-label')).toBe('Collapse /projects');

    fold('projects0').click();
    fixture.detectChanges();
    expect(texts('nav .route-row')).toEqual(['/ → projects', 'projects 0', '**']);
    expect(fold('projects0').getAttribute('aria-expanded')).toBe('false');
    expect(fold('projects0').getAttribute('aria-label')).toBe('Expand /projects');
    // A leaf has no fold button, only its count.
    const leaf = [...element.querySelectorAll<HTMLElement>('nav .route-row')].at(-1)!;
    expect(leaf.querySelector('button.fold')).toBeNull();

    fold('projects0').click();
    fixture.detectChanges();
    expect(texts('nav .route-row')).toHaveLength(6);
    // Folding selects nothing: the route and the URL stay as they were.
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(query()).toEqual({});
  });

  it('reads the state a tab picks, and resets the tab when the route changes', async () => {
    const { fixture, element, texts } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    element.querySelectorAll<HTMLButtonElement>('[aria-label="States"] [role="tab"]')[1].click();
    await navigated(fixture);
    expect(query()).toEqual({ state: 'loaded' });
    http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
    await settle();
    fixture.detectChanges();
    expect(
      element.querySelector('[aria-label="States"] [aria-selected="true"]')?.textContent?.trim(),
    ).toBe('loaded');

    const projects = [...element.querySelectorAll<HTMLElement>('nav .route-row')]
      .find((row) => row.textContent?.replace(/\s+/g, '') === 'projects0')!
      .querySelector<HTMLButtonElement>('button.route')!;
    projects.click();
    await navigated(fixture);
    expect(query()).toEqual({ route: 'projects' });
    expect(element.querySelector('h2')?.textContent).toBe('/projects');
    expect(element.querySelector('.no-states')?.textContent).toContain(
      'No screenshot test for this route, so nothing is frozen.',
    );
    expect(texts('aside li.call')).toEqual([]);
    expect(texts('aside li')).toEqual([
      'Its spec answers no request.',
      'This route touches no mapped entity.',
    ]);
    expect(element.querySelector('.unmatched')).toBeNull();
  });

  it('opens the route and the state the URL names', async () => {
    const { fixture, element } = await render(
      'qits-landing-app',
      undefined,
      undefined,
      '?route=projects%2F%3Aslug%2Frepositories&state=loaded',
    );
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(
      element.querySelector('[aria-label="States"] [aria-selected="true"]')?.textContent?.trim(),
    ).toBe('loaded');
    await answerFreeze(LOADED_FREEZE, fixture);
  });

  it('opens the first route with states for a route the tree does not have', async () => {
    const { fixture, element } = await render(
      'qits-landing-app',
      undefined,
      undefined,
      '?route=nowhere',
    );
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
    expect(
      element.querySelector('[aria-label="States"] [aria-selected="true"]')?.textContent?.trim(),
    ).toBe('error');
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
    // The hidden calls are neither matched nor counted, and their provider is not named.
    expect(element.querySelector('.unmatched')).toBeNull();
    clickTab(element, 'Entities');
    fixture.detectChanges();
    expect(element.querySelector('.entity-summary')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '0 of 0 domain entities have no route',
    );
    expect(element.querySelectorAll('h3.group')).toHaveLength(0);
  });

  it('names a provider the routes call that publishes no entity map', async () => {
    const { fixture, element, texts } = await render('qits-landing-app');
    await answerFreeze(ERROR_FREEZE, fixture);
    expect(texts('li.route-entity')).toEqual([]);
    expect(element.querySelector('.no-entities')?.textContent?.trim()).toBe(
      'This route touches no mapped entity.',
    );
    expect(element.querySelector('.unmatched')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '2 calls touch no mapped entity.',
    );
    clickTab(element, 'Entities');
    fixture.detectChanges();
    expect(texts('h3.group')).toEqual(['qits-projects-service']);
    expect(element.querySelector('.no-map')?.textContent?.trim()).toBe('No entity map published');
    // The middle and the calls stay: the tab changes the left panel only.
    expect(element.querySelector('h2')?.textContent).toBe('/projects/:slug/repositories');
  });

  it('keeps the page up when the entity maps cannot be read', async () => {
    const { fixture, element, texts } = await render('qits-landing-app', undefined, async () => {
      http.expectOne(SITES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    });
    await answerFreeze(ERROR_FREEZE, fixture);
    expect(texts('li.call')).toHaveLength(2);
    expect(element.querySelector('aside .entities-error')?.textContent?.trim()).toBe(
      'Could not read the entity maps.',
    );
  });

  describe('with a published entity map', () => {
    it('lists the route’s domain entities with their verbs', async () => {
      const { fixture, element, texts } = await render('qits-landing-app', undefined, recordedMap);
      await answerFreeze(ERROR_FREEZE, fixture);
      expect([...element.querySelectorAll('li.route-entity')].map(words)).toEqual([
        'Project ↗ qits-projects list',
        'Repository ↗ qits-projects list',
      ]);
      expect(element.querySelector('.unmatched')).toBeNull();
      expect(texts('li.call')).toHaveLength(2);
    });

    it('lists the entities by application, untouched first, and an entity’s routes', async () => {
      const { fixture, element } = await render('qits-landing-app', undefined, recordedMap);
      await answerFreeze(ERROR_FREEZE, fixture);
      clickTab(element, 'Entities');
      fixture.detectChanges();
      const text = (selector: string) => [...element.querySelectorAll(selector)].map(words);
      expect(text('.entity-summary')).toEqual(['1 of 3 domain entities have no route']);
      expect(text('.left-out')).toEqual(['1 technical or projection entity left out.']);
      expect(text('h3.group')).toEqual(['qits-projects']);
      expect(text('button.entity')).toEqual([
        'WorkEntity No route shows this',
        'Project 1',
        'Repository 1',
      ]);

      element.querySelectorAll<HTMLButtonElement>('button.entity')[1].click();
      fixture.detectChanges();
      expect(text('.entity-heading')).toEqual(['Project · qits-projects']);
      expect(element.querySelector('.entity-heading a.entity-page')?.getAttribute('href')).toBe(
        PROJECT_PAGE,
      );
      expect(text('li.entity-route')).toEqual(['/projects/:slug/repositories list']);

      element.querySelectorAll<HTMLButtonElement>('button.entity')[0].click();
      fixture.detectChanges();
      expect(text('aside li')).toEqual(['No route shows this.']);

      element.querySelectorAll<HTMLButtonElement>('button.entity')[1].click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('li.entity-route button')!.click();
      await navigated(fixture);
      expect(query()).toEqual({ route: 'projects/:slug/repositories' });
      expect(
        element.querySelector('[aria-label="Panels"] [aria-selected="true"]')?.textContent?.trim(),
      ).toBe('Routes');
      expect(element.querySelector('nav [aria-current="page"]')?.textContent).toContain(
        'repositories',
      );
      expect(element.querySelectorAll('li.route-entity')).toHaveLength(2);
    });

    it('links each entity to its entity page beside the pick (qits-1994)', async () => {
      const { fixture, element } = await render('qits-landing-app', undefined, recordedMap);
      await answerFreeze(ERROR_FREEZE, fixture);
      const routeLink = element.querySelector<HTMLAnchorElement>('li.route-entity a.entity-link');
      expect(routeLink?.getAttribute('href')).toBe(PROJECT_PAGE);
      expect(routeLink?.getAttribute('aria-label')).toBe('Open Project entity page');

      clickTab(element, 'Entities');
      fixture.detectChanges();
      const links = [...element.querySelectorAll<HTMLAnchorElement>('a.entity-link')]
        .filter((a) => !a.closest('li.route-entity'))
        .map((a) => a.getAttribute('aria-label'));
      expect(links).toEqual([
        'Open WorkEntity entity page',
        'Open Project entity page',
        'Open Repository entity page',
      ]);
      // The pick is still the button beside it.
      expect(element.querySelectorAll('button.entity')).toHaveLength(3);
    });

    it('names a contracts site without entities.json, and a map that cannot be read', async () => {
      for (const [status, expected] of [
        [404, 'No entity map published'],
        [500, 'Could not read its entity map'],
      ] as const) {
        TestBed.resetTestingModule();
        configure();
        const { fixture, element, texts } = await render(
          'qits-landing-app',
          undefined,
          answerContracts((read) => read.flush(null, { status, statusText: 'x' })),
        );
        await answerFreeze(ERROR_FREEZE, fixture);
        expect(texts('li.call')).toHaveLength(2);
        expect(element.querySelector('.unmatched')?.textContent).toContain('2 calls touch');
        clickTab(element, 'Entities');
        fixture.detectChanges();
        expect(texts('h3.group')).toEqual(['qits-projects-service']);
        expect(element.querySelector('.no-map, .map-error')?.textContent?.trim()).toBe(expected);
        http.verify();
      }
    });
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
    expect(
      element
        .querySelector('[aria-current="page"]')
        ?.closest('.route-row')
        ?.textContent?.replace(/\s+/g, ''),
    ).toBe('projects0');
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

    element.querySelectorAll<HTMLButtonElement>('[aria-label="States"] [role="tab"]')[1].click();
    await navigated(fixture);
    http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
    expect(element.querySelector('.link-notice')).toBeNull();
  });

  describe('outcomes (qits-2006)', () => {
    /** The page for the landing app, its manifest carrying `outcomes`, its first state answered. */
    async function renderOutcomes(outcomes: unknown = OUTCOMES) {
      const rendered = await render(
        'qits-landing-app',
        undefined,
        undefined,
        '',
        withOutcomes(outcomes),
      );
      await answerFreeze(ERROR_FREEZE, rendered.fixture);
      return rendered;
    }

    /** Hands `page` a loaded frame holding `html`, as the iframe's `load` does; gives its document. */
    function loadFrame(page: UiBuilderPage, html: string): Document {
      const doc = document.implementation.createHTMLDocument('freeze');
      doc.body.innerHTML = html;
      (page as unknown as { frameLoaded(e: Event): void }).frameLoaded({
        target: { contentDocument: doc },
      } as unknown as Event);
      return doc;
    }

    /** The outcome row whose pick reads `interaction · outcome`. */
    function row(element: HTMLElement, mark: string): HTMLElement {
      return [...element.querySelectorAll<HTMLElement>('aside li.outcome')].find((li) =>
        li.querySelector('.outcome-pick')?.getAttribute('title')?.endsWith(` ${mark}`),
      )!;
    }

    /** An element's text: its innermost elements' texts joined by spaces. */
    function leaves(element: Element): string {
      const parts = [...element.querySelectorAll('*')].filter((e) => !e.children.length);
      return parts
        .map((part) => (part.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ');
    }

    const TRIGGER = '<p>x</p><button data-qits-outcome="a:b repositories:opened">open</button>';

    it('lists the route’s outcomes below Calls and states, with their gaps', async () => {
      const { element } = await renderOutcomes();
      expect(
        [...element.querySelectorAll('aside[aria-label="Calls"] h3')].map((h) =>
          h.textContent?.trim(),
        ),
      ).toEqual(['Calls and states', 'Outcomes', 'Entities']);
      expect([...element.querySelectorAll('aside li.outcome')].map(leaves)).toEqual([
        'repositories · lost exit No route of this app matches /nowhere No test reaches this No screenshot shows its trigger',
        'repositories · opened exit → /projects opens a project',
        'repositories · refused stay Show result lists the project’s repositories',
        'repositories · unreached stay No test reaches this No screenshot shows its trigger',
      ]);
      const unreached = row(element, 'repositories:unreached');
      expect(unreached.querySelector('ui-chip.no-test')?.textContent).toBe('No test reaches this');
      expect(unreached.querySelector('ui-chip.no-trigger')?.textContent).toBe(
        'No screenshot shows its trigger',
      );
      expect(
        row(element, 'repositories:opened').querySelector('.reached-by')?.getAttribute('title'),
      ).toBe('project-repositories.page.browser.spec.ts › opens a project');
      // The shared ones are counted, never repeated.
      expect(
        element.querySelector('.shared-outcomes')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('2 shared outcomes from layouts');
    });

    it('selects an exit’s target route, unfolding the tree to it', async () => {
      const { fixture, element } = await renderOutcomes();
      element.querySelector<HTMLButtonElement>('nav .route-row button.fold')!.click();
      fixture.detectChanges();
      expect(element.querySelectorAll('nav .route-row')).toHaveLength(1);

      row(element, 'repositories:opened')
        .querySelector<HTMLButtonElement>('.outcome-target')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ route: 'projects' });
      expect(element.querySelectorAll('nav .route-row')).toHaveLength(6);
      expect(
        element
          .querySelector('nav [aria-current="page"]')
          ?.closest('.route-row')
          ?.textContent?.replace(/\s+/g, ''),
      ).toBe('projects0');
      expect(element.querySelector('aside .no-outcomes')?.textContent?.trim()).toBe(
        'This route declares no outcomes.',
      );
    });

    it('says why no outcome is listed, and still shows the routes', async () => {
      for (const [manifest, expected] of [
        [
          artifacts.body(BUNDLE, 'getDocsFile'),
          'This bundle was frozen before outcomes were recorded.',
        ],
        [withOutcomes({ declared: [], fired: [] }), 'qits-landing-app declares no outcomes yet.'],
        [
          withOutcomes({ declared: [OUTCOMES.declared[4]], fired: [] }),
          'This route declares no outcomes.',
        ],
        [withOutcomes({ declared: 'x' }), "Could not read this bundle's outcomes."],
      ] as const) {
        TestBed.resetTestingModule();
        configure();
        const { fixture, element, texts } = await render(
          'qits-landing-app',
          undefined,
          undefined,
          '',
          manifest,
        );
        await answerFreeze(ERROR_FREEZE, fixture);
        expect(texts('nav .route-row')).toHaveLength(6);
        expect(element.querySelector('aside .no-outcomes')?.textContent?.trim()).toBe(expected);
        expect(element.querySelectorAll('aside li.outcome')).toHaveLength(0);
        http.verify();
      }
    });

    it('lists the shared outcomes once, by scope, in their own tab', async () => {
      const { fixture, element } = await renderOutcomes();
      element.querySelector<HTMLButtonElement>('.shared-outcomes')!.click();
      fixture.detectChanges();
      expect(
        element.querySelector('[aria-label="Panels"] [aria-selected="true"]')?.textContent?.trim(),
      ).toBe('Outcomes');
      const tab = element.querySelector<HTMLElement>('section[aria-label="Shared outcomes"]')!;
      expect(
        [...tab.querySelectorAll('h3.outcome-group')].map((h) => h.textContent?.trim()),
      ).toEqual(['App-wide', '/ and below']);
      expect([...tab.querySelectorAll('li.outcome')].map(leaves)).toEqual([
        'toasts · dismissed stay No test reaches this No screenshot shows its trigger',
        'shell · signed-out exit → /projects signs out',
      ]);
      // The right panel lists the route's own outcomes only.
      expect(element.querySelectorAll('aside li.outcome')).toHaveLength(4);
    });

    it('highlights an outcome’s trigger in the frame, and clears it on a second click', async () => {
      const { fixture, element, page } = await renderOutcomes();
      const doc = loadFrame(page, TRIGGER);
      const pick = () =>
        row(element, 'repositories:opened').querySelector<HTMLButtonElement>('.outcome-pick')!;
      pick().click();
      fixture.detectChanges();
      expect(pick().getAttribute('aria-pressed')).toBe('true');
      const trigger = doc.querySelector('button')!;
      expect(trigger.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(doc.head.querySelectorAll('style[data-qits-builder]')).toHaveLength(1);
      expect(doc.head.querySelector('style[data-qits-builder]')?.textContent).toContain(
        '[data-qits-builder-highlight]',
      );
      // The shown state shows the trigger: nothing switches.
      expect(query()).toEqual({});

      // A new load (a state switch reloads srcdoc) draws it again.
      const reloaded = loadFrame(page, TRIGGER);
      expect(reloaded.querySelector('button')!.hasAttribute('data-qits-builder-highlight')).toBe(
        true,
      );

      pick().click();
      fixture.detectChanges();
      expect(pick().getAttribute('aria-pressed')).toBe('false');
      expect(reloaded.querySelector('[data-qits-builder-highlight]')).toBeNull();
    });

    it('clears the highlight when the tree picks another route', async () => {
      const { fixture, element, page } = await renderOutcomes();
      const doc = loadFrame(page, TRIGGER);
      row(element, 'repositories:opened')
        .querySelector<HTMLButtonElement>('.outcome-pick')!
        .click();
      fixture.detectChanges();
      expect(doc.querySelector('[data-qits-builder-highlight]')).not.toBeNull();
      [...element.querySelectorAll<HTMLElement>('nav .route-row')]
        .find((r) => r.textContent?.replace(/\s+/g, '') === 'projects0')!
        .querySelector<HTMLButtonElement>('button.route')!
        .click();
      await navigated(fixture);
      expect(doc.querySelector('[data-qits-builder-highlight]')).toBeNull();
      expect(element.querySelector('aside [aria-pressed="true"]')).toBeNull();
    });

    it('switches to a state that shows the trigger, and highlights it there', async () => {
      const { fixture, element, page } = await renderOutcomes();
      loadFrame(page, TRIGGER);
      row(element, 'repositories:refused')
        .querySelector<HTMLButtonElement>('.outcome-pick')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      const doc = loadFrame(page, '<form data-qits-outcome="repositories:refused">x</form>');
      expect(doc.querySelector('form')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(element.querySelector('.link-notice')).toBeNull();

      // A freeze that lists the trigger without the element says so.
      loadFrame(page, '<p>no mark</p>');
      fixture.detectChanges();
      expect(element.querySelector('.link-notice')?.textContent?.trim()).toBe(
        'This screenshot has no element for repositories:refused.',
      );
    });

    it('opens the state a stay’s result was shot in', async () => {
      const { fixture, element } = await renderOutcomes();
      row(element, 'repositories:refused')
        .querySelector<HTMLButtonElement>('.outcome-result')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      expect(
        element.querySelector('[aria-label="States"] [aria-selected="true"]')?.textContent?.trim(),
      ).toBe('loaded');
    });
  });
});
