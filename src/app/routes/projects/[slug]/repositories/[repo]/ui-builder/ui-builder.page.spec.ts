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
  Freeze,
  ManifestRoute,
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

/** The recorded manifest with `outcomes` and no freeze's `triggers`: a bundle older than them. */
function withoutTriggers(outcomes: unknown = OUTCOMES): RoutesManifest {
  return {
    ...artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile'),
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
    // The selected state's calls (qits-2080): `error` answers listProjects alone, which the one
    // route with freezes records, so it is app-wide, in its group, collapsed.
    expect(texts('li.call')).toEqual([]);
    expect(element.querySelector('.only-app-wide')?.textContent?.trim()).toBe(
      'No call but the app-wide ones.',
    );
    const appWide = element.querySelector<HTMLButtonElement>('aside .app-wide-toggle')!;
    expect(words(appWide)).toBe('▸ 1 app-wide call');
    expect(appWide.getAttribute('aria-expanded')).toBe('false');
    appWide.click();
    fixture.detectChanges();
    expect(appWide.getAttribute('aria-expanded')).toBe('true');
    expect(texts('aside .app-wide-calls li.call')).toEqual([
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
    expect(words(element.querySelector('.app-wide-toggle')!)).toBe('▸ 1 app-wide call');
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
    // `error` answers one call; the scope hides it, app-wide or not (qits-2080).
    expect(element.querySelector('.app-wide-toggle')).toBeNull();
    expect(element.querySelector('.hidden-calls')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Hid 1 call to providers outside contract.',
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
    const { fixture, element } = await render('qits-landing-app', undefined, async () => {
      http.expectOne(SITES_URL).flush(null, { status: 500, statusText: 'Server Error' });
    });
    await answerFreeze(ERROR_FREEZE, fixture);
    expect(words(element.querySelector('.app-wide-toggle')!)).toBe('▸ 1 app-wide call');
    expect(element.querySelector('aside .entities-error')?.textContent?.trim()).toBe(
      'Could not read the entity maps.',
    );
  });

  describe('with a published entity map', () => {
    it('lists the route’s domain entities with their verbs', async () => {
      const { fixture, element } = await render('qits-landing-app', undefined, recordedMap);
      await answerFreeze(ERROR_FREEZE, fixture);
      expect([...element.querySelectorAll('li.route-entity')].map(words)).toEqual([
        'Project ↗ qits-projects list',
        'Repository ↗ qits-projects list',
      ]);
      expect(element.querySelector('.unmatched')).toBeNull();
      expect(words(element.querySelector('.app-wide-toggle')!)).toBe('▸ 1 app-wide call');
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
        expect(words(element.querySelector('.app-wide-toggle')!)).toBe('▸ 1 app-wide call');
        // The route's entities stay the route's: both its calls (qits-2080).
        expect(element.querySelector('.unmatched')?.textContent).toContain('2 calls touch');
        clickTab(element, 'Entities');
        fixture.detectChanges();
        expect(texts('h3.group')).toEqual(['qits-projects-service']);
        expect(element.querySelector('.no-map, .map-error')?.textContent?.trim()).toBe(expected);
        http.verify();
      }
    });
  });

  describe('kinds and viewports (qits-2047)', () => {
    /** The repositories page's spec directory, where its freezes sit. */
    const SHOTS = ERROR_FREEZE.replace(/\/error\.html$/, '');
    const WIDTHS = ['PHONE', 'TABLET', 'DESKTOP'] as const;
    const fileOf = (name: string, viewport: string) =>
      `${SHOTS}/${name}-${viewport.toLowerCase()}.html`;

    /**
     * The recorded manifest, the repositories route's freezes replaced by `states`, each shot at
     * the three preset widths (qits-2046) as a route spec shoots it.
     */
    function shotAtWidths(states: readonly [string, Freeze['kind']][]): RoutesManifest {
      const recorded = artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile');
      const freezes = states.flatMap(([name, kind]) =>
        WIDTHS.map((viewport): Freeze => ({
          file: fileOf(name, viewport),
          name,
          route: REPOSITORIES,
          records: [],
          kind,
          viewport,
        })),
      );
      return {
        ...recorded,
        freezes: [...recorded.freezes.filter((f) => f.route !== REPOSITORIES), ...freezes],
        byRoute: { [REPOSITORIES]: freezes.map((f) => f.file) },
      };
    }

    const STATES: [string, Freeze['kind']][] = [
      ['error', 'ERROR'],
      ['loading', 'PENDING'],
      ['loaded', 'DATA'],
    ];

    const renderWidths = (query = '', states = STATES) =>
      render('qits-landing-app', undefined, undefined, query, shotAtWidths(states));

    const selectedTab = (element: HTMLElement) =>
      element.querySelector('[aria-label="States"] [aria-selected="true"]');

    const pressed = (element: HTMLElement) =>
      element.querySelector('[aria-label="Viewport"] [aria-pressed="true"]')?.textContent?.trim();

    const viewportButton = (element: HTMLElement, label: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('[aria-label="Viewport"] button')].find(
        (b) => b.textContent?.trim() === label,
      )!;

    it('opens on the first DATA state, one tab per state with its kind, at the desktop width', async () => {
      const { fixture, element } = await renderWidths();
      const tabs = [...element.querySelectorAll('[aria-label="States"] [role="tab"]')];
      expect(tabs.map((tab) => tab.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'loaded data',
        'loading pending',
        'error error',
      ]);
      expect(tabs.map((tab) => tab.querySelector('ui-chip.kind')?.className)).toEqual([
        expect.stringContaining('bg-mint-leaf-100'),
        expect.stringContaining('bg-sunflower-gold-100'),
        expect.stringContaining('bg-cinnabar-100'),
      ]);
      expect(selectedTab(element)?.firstChild?.textContent?.trim()).toBe('loaded');
      expect(pressed(element)).toBe('Desktop');
      // The tree counts the states, not their three freezes each.
      expect(words(element.querySelectorAll('nav .route-row')[3])).toBe('repositories 3');

      await answerFreeze(fileOf('loaded', 'DESKTOP'), fixture);
      const frame = element.querySelector<HTMLIFrameElement>('iframe')!;
      expect(frame.style.width).toBe('1440px');
      expect(frame.style.height).toBe('900px');
      expect(frame.style.transform).toBe('');
      expect(frame.getAttribute('sandbox')).toBe('allow-same-origin');
      expect(frame.classList.contains('h-[32rem]')).toBe(false);
    });

    it('opens the state the URL names over the first DATA state', async () => {
      const { fixture, element } = await renderWidths('?state=error');
      expect(selectedTab(element)?.firstChild?.textContent?.trim()).toBe('error');
      await answerFreeze(fileOf('error', 'DESKTOP'), fixture);
    });

    it('opens on the first state when none is DATA', async () => {
      const { fixture, element } = await renderWidths('', [
        ['error', 'ERROR'],
        ['empty', 'NO_DATA'],
      ]);
      expect(selectedTab(element)?.firstChild?.textContent?.trim()).toBe('empty');
      await answerFreeze(fileOf('empty', 'DESKTOP'), fixture);
    });

    it('draws the state’s freeze at the viewport the switch picks, its frame that wide', async () => {
      const { fixture, element } = await renderWidths();
      await answerFreeze(fileOf('loaded', 'DESKTOP'), fixture);
      viewportButton(element, 'Phone').click();
      await navigated(fixture);
      expect(query()).toEqual({ viewport: 'phone' });
      http.expectOne(fileUrl(fileOf('loaded', 'PHONE'))).flush('<p>phone</p>');
      await settle();
      fixture.detectChanges();
      expect(pressed(element)).toBe('Phone');
      const frame = element.querySelector<HTMLIFrameElement>('iframe')!;
      expect(frame.style.width).toBe('390px');
      expect(frame.style.height).toBe('844px');

      // A state picked keeps the viewport.
      element.querySelectorAll<HTMLButtonElement>('[aria-label="States"] [role="tab"]')[2].click();
      await navigated(fixture);
      expect(query()).toEqual({ viewport: 'phone', state: 'error' });
      http.expectOne(fileUrl(fileOf('error', 'PHONE'))).flush('<p>error</p>');
      await settle();
    });

    it('keeps the URL’s viewport when the tree picks another route', async () => {
      const { fixture, element } = await renderWidths('?viewport=tablet&state=error');
      expect(pressed(element)).toBe('Tablet');
      await answerFreeze(fileOf('error', 'TABLET'), fixture);
      [...element.querySelectorAll<HTMLElement>('nav .route-row')]
        .find((row) => row.textContent?.replace(/\s+/g, '') === 'projects0')!
        .querySelector<HTMLButtonElement>('button.route')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ route: 'projects', viewport: 'tablet' });
    });

    it('scales a frame wider than its column down to fit, its box as tall as the scaled frame', async () => {
      let resized: (() => void) | undefined;
      class FakeResizeObserver {
        constructor(private readonly callback: () => void) {}
        observe() {
          resized = this.callback;
        }
        disconnect() {
          resized = undefined;
        }
      }
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      try {
        const { fixture, element } = await renderWidths();
        await answerFreeze(fileOf('loaded', 'DESKTOP'), fixture);
        // 1440px and its 2px border in a 721px column: half its size.
        const box = element.querySelector<HTMLElement>('.frame-box')!;
        Object.defineProperty(box, 'clientWidth', { configurable: true, value: 721 });
        resized?.();
        fixture.detectChanges();
        const frame = element.querySelector<HTMLIFrameElement>('iframe')!;
        expect(frame.style.width).toBe('1440px');
        expect(frame.style.transform).toBe('scale(0.5)');
        expect(element.querySelector<HTMLElement>('.frame-scaler')!.style.height).toBe('451px');

        // A column wider than the frame draws it at its own size.
        Object.defineProperty(box, 'clientWidth', { configurable: true, value: 2000 });
        resized?.();
        fixture.detectChanges();
        expect(frame.style.transform).toBe('');
        expect(element.querySelector<HTMLElement>('.frame-scaler')!.style.height).toBe('902px');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('shows no switch, no kind and the full-width frame for a bundle without them', async () => {
      const { fixture, element } = await render('qits-landing-app');
      expect(element.querySelector('[aria-label="Viewport"]')).toBeNull();
      expect(element.querySelector('[aria-label="States"] ui-chip')).toBeNull();
      await answerFreeze(ERROR_FREEZE, fixture);
      const frame = element.querySelector<HTMLIFrameElement>('iframe')!;
      expect(frame.classList.contains('h-[32rem]')).toBe(true);
      expect(frame.classList.contains('w-full')).toBe(true);
      expect(frame.style.width).toBe('');
      expect(element.querySelector('.frame-scaler')).toBeNull();
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

  describe('forwards (qits-2076)', () => {
    const DETAIL = 'projects/:slug/work/detail/:id';
    const AGENT = `${DETAIL}/agent`;
    const TAB = `${AGENT}/:tab`;
    const AGENT_PAGE = 'projects/:slug/agents/:agentId';

    /** The agent layout's one state: its spinner, shown while it forwards. */
    const WAITING: Freeze = {
      file: 'src/app/routes/projects/[slug]/work/detail/[id]/agent/work-agent.layout.browser.spec.ts/waiting.html',
      name: 'waiting',
      route: AGENT,
      records: [],
      kind: 'PENDING',
    };

    /** One of the agent layout's untriggered exits, declared for its route and below. */
    const follow = (outcome: string, to: string): DeclaredOutcome => ({
      route: AGENT,
      interaction: 'follow-work-item-agent',
      outcome,
      kind: 'exit',
      to,
      global: true,
      triggered: false,
      file: 'src/app/routes/projects/[slug]/work/detail/[id]/agent/work-agent.layout.ts',
    });

    /**
     * The recorded manifest with the work item's agent layout, as `@qits/angular` writes it: the
     * layout only forwards (`forward`), its `''` and `:tab` children render nothing. Its five exits
     * lead to the agent page, its chat and files tabs, a terminal tab the app lacks, and the item.
     * With `waiting`, the layout has its one PENDING state.
     */
    function withForward(waiting = true): RoutesManifest {
      const recorded = artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile');
      const [root] = recorded.routes;
      const children = root.children ?? [];
      const added: ManifestRoute[] = [
        {
          path: DETAIL,
          fullPath: DETAIL,
          children: [
            { path: '', fullPath: DETAIL },
            {
              path: 'agent',
              fullPath: AGENT,
              forward: true,
              children: [
                { path: '', fullPath: AGENT, rendersNothing: true, children: [] },
                { path: ':tab', fullPath: TAB, entry: true, rendersNothing: true, children: [] },
              ],
            },
          ],
        },
        {
          path: AGENT_PAGE,
          fullPath: AGENT_PAGE,
          children: [
            { path: '', fullPath: AGENT_PAGE },
            { path: 'chat', fullPath: `${AGENT_PAGE}/chat` },
            { path: 'files', fullPath: `${AGENT_PAGE}/files` },
          ],
        },
      ];
      return {
        ...recorded,
        routes: [
          { ...root, children: [...children.slice(0, -1), ...added, ...children.slice(-1)] },
        ],
        freezes: waiting ? [...recorded.freezes, WAITING] : recorded.freezes,
        byRoute: waiting ? { ...recorded.byRoute, [AGENT]: [WAITING.file] } : recorded.byRoute,
        outcomes: {
          declared: [
            follow('toAgent', AGENT_PAGE),
            follow('toAgentChat', `${AGENT_PAGE}/chat`),
            follow('toAgentFiles', `${AGENT_PAGE}/files`),
            follow('toAgentTerminal', `${AGENT_PAGE}/terminal`),
            follow('toItem', DETAIL),
          ],
          fired: [],
        },
      };
    }

    const renderForward = (route: string, waiting = true) =>
      render(
        'qits-landing-app',
        undefined,
        undefined,
        `?route=${encodeURIComponent(route)}`,
        withForward(waiting),
      );

    it('selects the forward for an address folded into it, and lists where it forwards to', async () => {
      const { fixture, element, texts } = await renderForward(TAB);
      expect(element.querySelector('h2')?.textContent).toBe(`/${AGENT}`);
      expect(element.querySelector('.also-answers')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `Also answers /${TAB}`,
      );
      // The folded `:tab` has no row; the forward's row is marked.
      const rows = texts('nav .route-row');
      expect(rows).not.toContain(':tab');
      expect(rows).toContain('agent ↪ 1');
      const mark = element.querySelector('nav [aria-current="page"] .forward-mark');
      expect(mark?.getAttribute('aria-label')).toBe('Forwards');
      expect(mark?.getAttribute('title')).toBe('Forwards');
      expect(element.querySelectorAll('nav .forward-mark')).toHaveLength(1);

      const forwards = element.querySelector('section[aria-label="Preview"] .forwards')!;
      expect(forwards.querySelector('h3')?.textContent?.trim()).toBe('Forwards to:');
      expect(
        [...forwards.querySelectorAll('li.forward')].map((li) =>
          (li.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual([
        `toAgent → /${AGENT_PAGE}`,
        `toAgentChat → /${AGENT_PAGE}/chat`,
        `toAgentFiles → /${AGENT_PAGE}/files`,
        `toAgentTerminal No route of this app matches /${AGENT_PAGE}/terminal`,
        `toItem → /${DETAIL}`,
      ]);
      // Above the states, whose one PENDING state is what shows while it forwards.
      expect(
        forwards.compareDocumentPosition(element.querySelector('[aria-label="States"]')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        [...element.querySelectorAll('[aria-label="States"] [role="tab"]')].map((tab) =>
          tab.textContent?.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['waiting while it forwards']);
      expect(element.querySelector('.no-states')).toBeNull();
      await answerFreeze(WAITING.file, fixture);

      [...forwards.querySelectorAll<HTMLButtonElement>('.outcome-target')]
        .find((button) => button.textContent?.trim().endsWith('/chat'))!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ route: `${AGENT_PAGE}/chat` });
      expect(element.querySelector('h2')?.textContent).toBe(`/${AGENT_PAGE}/chat`);
      expect(element.querySelector('.forwards')).toBeNull();
      expect(element.querySelector('.also-answers')).toBeNull();
    });

    it('names no missing screenshot test for a forward without states', async () => {
      const { fixture, element } = await renderForward(AGENT, false);
      expect(element.querySelector('h2')?.textContent).toBe(`/${AGENT}`);
      expect(element.querySelectorAll('.forwards li.forward')).toHaveLength(5);
      expect(element.querySelector('[aria-label="States"]')).toBeNull();
      expect(element.querySelector('.no-states')).toBeNull();
      expect(element.textContent).not.toContain('No screenshot test');

      // Another route without states still says so.
      [...element.querySelectorAll<HTMLElement>('nav .route-row')]
        .find((row) => row.textContent?.replace(/\s+/g, '') === 'projects0')!
        .querySelector<HTMLButtonElement>('button.route')!
        .click();
      await navigated(fixture);
      expect(element.querySelector('.no-states')?.textContent).toContain(
        'No screenshot test for this route, so nothing is frozen.',
      );
    });
  });

  describe('outcomes (qits-2006)', () => {
    /** The page for the landing app, its manifest carrying `outcomes`, its first state answered. */
    async function renderOutcomes(
      outcomes: unknown = OUTCOMES,
      manifest: RoutesManifest = withOutcomes(outcomes),
    ) {
      const rendered = await render('qits-landing-app', undefined, undefined, '', manifest);
      await answerFreeze(ERROR_FREEZE, rendered.fixture);
      return rendered;
    }

    /**
     * Hands `page` a loaded frame holding `html`, as the iframe's `load` does; gives its document.
     * Its URL is `about:srcdoc`, a freeze's document, unless `url` says `about:blank`: the initial
     * document a frame drawn anew loads first (qits-2072).
     */
    function loadFrame(
      page: UiBuilderPage,
      html: string,
      url: 'about:srcdoc' | 'about:blank' = 'about:srcdoc',
    ): Document {
      const doc = document.implementation.createHTMLDocument('freeze');
      doc.body.innerHTML = html;
      Object.defineProperty(doc, 'URL', { configurable: true, value: url });
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

    /** The row, among those not visible here (qits-2080), of the outcome `mark`. */
    function unseen(element: HTMLElement, mark: string): HTMLElement {
      return [...element.querySelectorAll<HTMLElement>('aside li.unseen-outcome')].find(
        (li) => li.querySelector('.font-mono')?.textContent?.trim() === mark,
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
      const { fixture, element } = await renderOutcomes();
      expect(
        [...element.querySelectorAll('aside[aria-label="Calls"] h3')].map((h) =>
          h.textContent?.trim(),
        ),
      ).toEqual(['Calls and states', 'Outcomes', 'Entities']);
      // `error` shows the trigger of `opened` alone of the page's (qits-2080).
      expect([...element.querySelectorAll('aside li.outcome')].map(leaves)).toEqual([
        'repositories · opened exit → /projects opens a project',
      ]);
      expect(
        row(element, 'repositories:opened').querySelector('.reached-by')?.getAttribute('title'),
      ).toBe('project-repositories.page.browser.spec.ts › opens a project');
      expect(element.querySelector('aside .predates')).toBeNull();
      expect(element.querySelector('aside .shown-result')).toBeNull();
      // The shared ones it shows are counted under them, collapsed (qits-2049): the shell's.
      const toggle = element.querySelector<HTMLButtonElement>('aside .shared-toggle')!;
      expect(words(toggle)).toBe('▸ Shared 1');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(element.querySelectorAll('aside .shared-outcomes')).toHaveLength(0);

      // The rest of the route's, page and shared, below, collapsed, with their gaps (qits-2080).
      const more = element.querySelector<HTMLButtonElement>('aside .unseen-toggle')!;
      expect(words(more)).toBe('▸ 4 more outcomes of this route are not visible here');
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(element.querySelector('aside .unseen-outcomes')).toBeNull();
      more.click();
      fixture.detectChanges();
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect([...element.querySelectorAll('aside li.unseen-outcome')].map(leaves)).toEqual([
        'repositories:lost exit No test reaches this No screenshot shows its trigger',
        'repositories:refused stay Shown in loaded',
        'repositories:unreached stay No test reaches this No screenshot shows its trigger',
        'toasts:dismissed stay No test reaches this No screenshot shows its trigger',
      ]);
      const unreached = unseen(element, 'repositories:unreached');
      expect(unreached.querySelector('ui-chip.no-test')?.textContent).toBe('No test reaches this');
      expect(unreached.querySelector('ui-chip.no-trigger')?.textContent).toBe(
        'No screenshot shows its trigger',
      );
      expect(unreached.querySelector('.shown-in')).toBeNull();
    });

    it('scopes the calls and the outcomes to the selected state, through the URL (qits-2080)', async () => {
      // A second route with a freeze (after the repositories route in the tree, which still opens
      // first): listProjects is recorded on both routes (app-wide), listProjectRepositories on one
      // of two, exactly half (the route's own).
      const manifest = withOutcomes();
      const WORKSPACES = 'projects/:slug/workspaces';
      const shot: Freeze = {
        file: 'src/app/routes/projects/[slug]/workspaces/workspaces.page.browser.spec.ts/x.html',
        name: 'x',
        route: WORKSPACES,
        records: [manifest.freezes[1].records[0]],
      };
      const { fixture, element, texts, page } = await renderOutcomes(OUTCOMES, {
        ...manifest,
        freezes: [...manifest.freezes, shot],
        byRoute: { ...manifest.byRoute, [WORKSPACES]: [shot.file] },
      });
      const router = TestBed.inject(Router);
      const base = router.url.split('?')[0];
      const own = () => texts('aside .own-calls li.call');
      const outcomes = () => [...element.querySelectorAll('aside li.outcome')].map(leaves);

      // `error`: listProjects alone, app-wide; the trigger of `opened`.
      expect(own()).toEqual([]);
      expect(words(element.querySelector('aside .app-wide-toggle')!)).toBe('▸ 1 app-wide call');
      expect(outcomes()).toEqual(['repositories · opened exit → /projects opens a project']);
      const doc = loadFrame(page, TRIGGER);
      row(element, 'repositories:opened')
        .querySelector<HTMLButtonElement>('.outcome-pick')!
        .click();
      fixture.detectChanges();
      expect(doc.querySelector('[data-qits-builder-highlight]')).not.toBeNull();

      // `loaded`, from the state list: its own call too, the trigger of `refused`, and the result
      // a test shot it for. `opened` is not in it: its highlight goes.
      stateTab(element, 'loaded');
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      expect(own()).toEqual([
        'listProjectRepositories qits-projects-service · “a project with repositories”',
      ]);
      expect(words(element.querySelector('aside .app-wide-toggle')!)).toBe('▸ 1 app-wide call');
      expect(outcomes()).toEqual([
        'repositories · refused stay Show result lists the project’s repositories',
      ]);
      expect(
        [...element.querySelectorAll('aside .shown-result')].map((p) =>
          p.textContent?.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['This screenshot shows the result of repositories:refused']);
      expect(element.querySelector('aside [aria-pressed="true"]')).toBeNull();
      element.querySelector<HTMLButtonElement>('aside .unseen-toggle')!.click();
      fixture.detectChanges();
      expect(leaves(unseen(element, 'repositories:opened'))).toBe(
        'repositories:opened exit Shown in error',
      );

      // Back, as history goes: `error`'s again.
      await router.navigateByUrl(base);
      await navigated(fixture);
      expect(query()).toEqual({});
      expect(own()).toEqual([]);
      expect(outcomes()).toEqual(['repositories · opened exit → /projects opens a project']);
      expect(element.querySelector('aside .shown-result')).toBeNull();

      // A link among those not visible selects its state as the state list does.
      unseen(element, 'repositories:refused')
        .querySelector<HTMLButtonElement>('.shown-in')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      expect(outcomes()).toEqual([
        'repositories · refused stay Show result lists the project’s repositories',
      ]);
    });

    it('keeps a highlight whose trigger the next state shows too (qits-2080)', async () => {
      const { fixture, element } = await renderOutcomes();
      element.querySelector<HTMLButtonElement>('aside .shared-toggle')!.click();
      fixture.detectChanges();
      row(element, 'shell:signed-out').querySelector<HTMLButtonElement>('.outcome-pick')!.click();
      fixture.detectChanges();
      stateTab(element, 'loaded');
      await navigated(fixture);
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      expect(
        row(element, 'shell:signed-out')
          .querySelector('.outcome-pick')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
    });

    it('shows the whole route’s outcomes for a state without triggers, and says why (qits-2080)', async () => {
      const { element } = await renderOutcomes(OUTCOMES, withoutTriggers());
      expect(element.querySelector('aside .predates')?.textContent?.trim()).toBe(
        'This bundle predates per-screenshot outcomes; showing the whole route.',
      );
      expect(
        [...element.querySelectorAll('aside .route-outcomes li.outcome')].map(
          (li) => li.querySelector('.outcome-pick')?.getAttribute('title') ?? '',
        ),
      ).toEqual([
        'Highlight the trigger of repositories:lost',
        'Highlight the trigger of repositories:opened',
        'Highlight the trigger of repositories:refused',
        'Highlight the trigger of repositories:unreached',
      ]);
      expect(words(element.querySelector('aside .shared-toggle')!)).toBe('▸ Shared 2');
      expect(element.querySelector('aside .unseen-toggle')).toBeNull();
      // Its calls are still the state's.
      expect(words(element.querySelector('aside .app-wide-toggle')!)).toBe('▸ 1 app-wide call');
    });

    it('says one more outcome is not visible, in the singular (qits-2080)', async () => {
      const { element } = await renderOutcomes({
        declared: [declared('opened', 'exit', 'projects'), declared('refused', 'stay')],
        fired: [],
      });
      expect(words(element.querySelector('aside .unseen-toggle')!)).toBe(
        '▸ 1 more outcome of this route is not visible here',
      );
    });

    describe('at the preset widths (qits-2080)', () => {
      const SHOTS = ERROR_FREEZE.replace(/\/error\.html$/, '');
      const at = (name: string, viewport: 'PHONE' | 'TABLET' | 'DESKTOP', triggers: string[]) =>
        ({
          file: `${SHOTS}/${name}-${viewport.toLowerCase()}.html`,
          name,
          route: REPOSITORIES,
          records: [],
          kind: name === 'loaded' ? 'DATA' : 'ERROR',
          viewport,
          triggers,
        }) satisfies Freeze;

      /**
       * `loaded` (DATA) and `error` at the three widths: `refused` shows in `loaded` at every
       * width, the menu's `opened` in it at PHONE only; `error` shows `lost`'s trigger at PHONE and
       * TABLET.
       */
      const FREEZES = [
        at('loaded', 'PHONE', ['repositories:refused', 'repositories:opened']),
        at('loaded', 'TABLET', ['repositories:refused']),
        at('loaded', 'DESKTOP', ['repositories:refused']),
        at('error', 'PHONE', ['repositories:lost']),
        at('error', 'TABLET', ['repositories:lost']),
        at('error', 'DESKTOP', []),
      ];

      async function renderWidths(query = '', shown = FREEZES[2]) {
        const recorded = artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile');
        const rendered = await render('qits-landing-app', undefined, undefined, query, {
          ...recorded,
          freezes: [...recorded.freezes.filter((f) => f.route !== REPOSITORIES), ...FREEZES],
          byRoute: { [REPOSITORIES]: FREEZES.map((f) => f.file) },
          outcomes: OUTCOMES,
        });
        await answerFreeze(shown.file, rendered.fixture);
        rendered.element.querySelector<HTMLButtonElement>('aside .unseen-toggle')!.click();
        rendered.fixture.detectChanges();
        return rendered;
      }

      const shownIn = (element: HTMLElement, mark: string) =>
        unseen(element, mark).querySelector<HTMLButtonElement>('.shown-in');

      it('links the state that shows a trigger, at the chosen width first, else the first', async () => {
        const { fixture, element } = await renderWidths();
        // `lost`: at DESKTOP no state shows it; `error` at PHONE is the first that does.
        expect(shownIn(element, 'repositories:lost')?.textContent?.trim()).toBe(
          'Shown in error · Phone',
        );
        expect(shownIn(element, 'repositories:opened')?.textContent?.trim()).toBe(
          'Shown in loaded · Phone',
        );
        shownIn(element, 'repositories:lost')!.click();
        await navigated(fixture);
        expect(query()).toEqual({ state: 'error', viewport: 'phone' });
        http.expectOne(fileUrl(FREEZES[3].file)).flush('<p>error</p>');
        await settle();
        fixture.detectChanges();
        expect(
          [...element.querySelectorAll('aside li.outcome')].map(
            (li) => li.querySelector('.outcome-pick')?.getAttribute('title') ?? '',
          ),
        ).toEqual(['Highlight the trigger of repositories:lost']);
        // At PHONE, `loaded`'s PHONE freeze is the one at the chosen width.
        expect(shownIn(element, 'repositories:refused')?.textContent?.trim()).toBe(
          'Shown in loaded · Phone',
        );
      });

      it('prefers the chosen width over the first state that shows the trigger', async () => {
        const { element } = await renderWidths('?state=error&viewport=tablet', FREEZES[4]);
        // `loaded` at TABLET, though its PHONE freeze comes first.
        expect(shownIn(element, 'repositories:refused')?.textContent?.trim()).toBe(
          'Shown in loaded · Tablet',
        );
      });
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
      expect(
        element.querySelector('aside .no-outcomes')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Not declared yet: 1 of 2 pages declares outcomes.');
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
          'Not declared yet: 0 of 2 pages declare outcomes.',
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
        expect(
          element.querySelector('aside .no-outcomes')?.textContent?.replace(/\s+/g, ' ').trim(),
        ).toBe(expected);
        expect(element.querySelectorAll('aside li.outcome')).toHaveLength(0);
        http.verify();
      }
    });

    /** The tree's outcome marks (qits-2045): each row's segment with its mark's label, or null. */
    function marks(element: HTMLElement): [string, string | null][] {
      return [...element.querySelectorAll<HTMLElement>('nav .route-row')].map((r) => [
        r.querySelector('button.route > span')!.textContent!.trim(),
        r.querySelector('.outcome-mark')?.getAttribute('aria-label') ?? null,
      ]);
    }

    it('marks a route that declares page outcomes, and only it (qits-2045)', async () => {
      const reached = {
        ...OUTCOMES,
        declared: OUTCOMES.declared.filter(
          (d) => d.outcome !== 'lost' && d.outcome !== 'unreached',
        ),
      };
      const { element } = await renderOutcomes(reached);
      const mark = element.querySelector<HTMLElement>('nav .outcome-mark')!;
      expect(mark.textContent?.trim()).toBe('◆2');
      expect(mark.getAttribute('role')).toBe('img');
      expect(mark.getAttribute('title')).toBe('2 outcomes');
      expect(mark.classList.contains('gap')).toBe(false);
      // The layout's and app-wide outcomes mark no row: not the root, not the redirect.
      expect(marks(element)).toEqual([
        ['/', null],
        ['projects', null],
        [':slug', null],
        ['repositories', '2 outcomes'],
        ['workspaces', null],
        ['**', null],
      ]);
    });

    it('marks a route with gaps in the gap tone, its label counting them (qits-2045)', async () => {
      const { element } = await renderOutcomes();
      const gap = element.querySelectorAll<HTMLElement>('nav .outcome-mark.gap');
      expect(gap).toHaveLength(1);
      expect(gap[0].textContent?.trim()).toBe('◆4');
      expect(gap[0].getAttribute('aria-label')).toBe('4 outcomes, 2 gaps');
      expect(gap[0].closest('.route-row')?.querySelector('button.route')?.textContent?.trim()).toBe(
        'repositories',
      );

      TestBed.resetTestingModule();
      configure();
      const one = await renderOutcomes({
        declared: [OUTCOMES.declared[3]],
        fired: [],
      });
      expect(one.element.querySelector('nav .outcome-mark.gap')?.getAttribute('aria-label')).toBe(
        '1 outcome, 1 gap',
      );
    });

    it('marks no route when the outcomes are absent or unreadable (qits-2045)', async () => {
      for (const manifest of [
        artifacts.body<RoutesManifest>(BUNDLE, 'getDocsFile'),
        withOutcomes({ declared: 'x' }),
      ]) {
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
        expect(element.querySelectorAll('nav .outcome-mark')).toHaveLength(0);
        http.verify();
      }
    });

    /** The Outcomes tab's section, opened (qits-2049). */
    function inboundTab(fixture: { detectChanges(): void }, element: HTMLElement): HTMLElement {
      clickTab(element, 'Outcomes');
      fixture.detectChanges();
      return element.querySelector<HTMLElement>('section[aria-label="Inbound outcomes"]')!;
    }

    /** The tab's route row for `fullPath`. */
    function inboundRow(tab: HTMLElement, fullPath: string): HTMLElement {
      return [...tab.querySelectorAll<HTMLElement>('li.inbound-route')].find(
        (li) => li.querySelector('button.inbound span')?.textContent?.trim() === `/${fullPath}`,
      )!;
    }

    it('lists the routes by how outcomes reach them, unreachable first (qits-2049)', async () => {
      const { fixture, element } = await renderOutcomes();
      const tab = inboundTab(fixture, element);
      expect(tab.querySelector('.inbound-summary')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        "1 of 2 routes can't be reached: no outcome leads to it.",
      );
      // The repositories route: nothing exits to it. `projects`: its page's exit and the shell's.
      expect([...tab.querySelectorAll('button.inbound')].map(leaves)).toEqual([
        '/projects/:slug/repositories No outcome leads here',
        '/projects 2',
      ]);
      const repositories = inboundRow(tab, REPOSITORIES);
      expect(repositories.querySelector('button.inbound')?.classList).toContain('unreachable');
      expect(repositories.querySelector('ui-chip.no-inbound')?.getAttribute('tone')).toBe(
        'waiting',
      );
      expect(inboundRow(tab, 'projects').querySelector('ui-chip')).toBeNull();
    });

    it('chips an entry point, and does not count it unreachable (qits-2049)', async () => {
      const manifest = withOutcomes();
      const entered = {
        ...manifest,
        routes: manifest.routes.map((root) => ({
          ...root,
          children: root.children?.map((child) =>
            child.fullPath === REPOSITORIES ? { ...child, entry: true } : child,
          ),
        })),
      };
      const rendered = await render('qits-landing-app', undefined, undefined, '', entered);
      await answerFreeze(ERROR_FREEZE, rendered.fixture);
      const tab = inboundTab(rendered.fixture, rendered.element);
      expect(tab.querySelector('.inbound-summary')).toBeNull();
      expect([...tab.querySelectorAll('button.inbound')].map(leaves)).toEqual([
        '/projects 2',
        '/projects/:slug/repositories Entry point',
      ]);
      const row = inboundRow(tab, REPOSITORIES);
      row.querySelector<HTMLButtonElement>('button.inbound')!.click();
      rendered.fixture.detectChanges();
      expect(row.querySelector('.no-sources')?.textContent?.trim()).toBe(
        'Entered from outside the app.',
      );
    });

    it('pluralizes the summary when every checked route is unreachable (qits-2073)', async () => {
      // Drop the two exits to `projects` (the page's own and the shell's): nothing then leads
      // to either checked route, and neither is an entry point.
      const noExits = {
        ...OUTCOMES,
        declared: OUTCOMES.declared.filter((outcome) => outcome.to !== 'projects'),
      };
      const { fixture, element } = await renderOutcomes(noExits);
      const tab = inboundTab(fixture, element);
      expect(tab.querySelector('.inbound-summary')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        "2 of 2 routes can't be reached: no outcome leads to them.",
      );
    });

    it('expands a route into its sources, where each is declared (qits-2049)', async () => {
      const { fixture, element } = await renderOutcomes();
      const tab = inboundTab(fixture, element);
      const projects = inboundRow(tab, 'projects');
      const toggle = projects.querySelector<HTMLButtonElement>('button.inbound')!;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(projects.querySelectorAll('li.outcome-source')).toHaveLength(0);
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect([...projects.querySelectorAll('li.outcome-source')].map(leaves)).toEqual([
        '/projects/:slug/repositories repositories:opened',
        '/ and below shell:signed-out',
      ]);
      toggle.click();
      fixture.detectChanges();
      expect(projects.querySelectorAll('li.outcome-source')).toHaveLength(0);
    });

    it('selects a source’s route on the freeze showing its trigger, and highlights it (qits-2049)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      const tab = inboundTab(fixture, element);
      const projects = inboundRow(tab, 'projects');
      projects.querySelector<HTMLButtonElement>('button.inbound')!.click();
      fixture.detectChanges();
      const source = (mark: string) =>
        [...projects.querySelectorAll<HTMLButtonElement>('li.outcome-source button.source')].find(
          (b) => b.textContent?.includes(mark),
        )!;

      // The page's exit: its trigger is in the shown state already, so nothing switches.
      const doc = loadFrame(page, TRIGGER);
      source('repositories:opened').click();
      fixture.detectChanges();
      expect(query()).toEqual({});
      expect(source('repositories:opened').getAttribute('aria-pressed')).toBe('true');
      expect(doc.querySelector('button')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      // The tab stays open, and a second click clears it.
      expect(
        element.querySelector('[aria-label="Panels"] [aria-selected="true"]')?.textContent?.trim(),
      ).toBe('Outcomes');
      source('repositories:opened').click();
      fixture.detectChanges();
      expect(source('repositories:opened').getAttribute('aria-pressed')).toBe('false');
      expect(doc.querySelector('[data-qits-builder-highlight]')).toBeNull();

      // The shell's: of the freezes showing it, the one nearest /projects (both are the
      // repositories route's; the selected route's `error` first), so nothing switches either.
      source('shell:signed-out').click();
      fixture.detectChanges();
      expect(query()).toEqual({});
      const shell = loadFrame(page, '<nav data-qits-outcome="shell:signed-out">x</nav>');
      expect(shell.querySelector('nav')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
    });

    it('selects the declaring route of a source no freeze shows (qits-2049)', async () => {
      const { fixture, element } = await renderOutcomes({
        ...OUTCOMES,
        declared: [...OUTCOMES.declared, declared('hidden', 'exit', 'projects')],
      });
      // From another route, so the source's route is the one selected.
      [...element.querySelectorAll<HTMLElement>('nav .route-row')]
        .find((r) => r.textContent?.replace(/\s+/g, '') === 'projects0')!
        .querySelector<HTMLButtonElement>('button.route')!
        .click();
      await navigated(fixture);
      const tab = inboundTab(fixture, element);
      const projects = inboundRow(tab, 'projects');
      projects.querySelector<HTMLButtonElement>('button.inbound')!.click();
      fixture.detectChanges();
      [...projects.querySelectorAll<HTMLButtonElement>('button.source')]
        .find((b) => b.textContent?.includes('repositories:hidden'))!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ route: REPOSITORIES });
      // Its state shows no trigger of it (qits-2080): the highlight goes, and it is listed among
      // the outcomes not visible here, with its gap and no state to open.
      expect(element.querySelector('aside [aria-pressed="true"]')).toBeNull();
      element.querySelector<HTMLButtonElement>('aside .unseen-toggle')!.click();
      fixture.detectChanges();
      const hidden = [...element.querySelectorAll<HTMLElement>('aside li.unseen-outcome')].find(
        (li) => li.textContent?.includes('repositories:hidden'),
      )!;
      expect(leaves(hidden)).toBe(
        'repositories:hidden exit No test reaches this No screenshot shows its trigger',
      );
      expect(hidden.querySelector('.shown-in')).toBeNull();
    });

    it('lists the outcomes that leave without a fixed target (qits-2049)', async () => {
      const { fixture, element } = await renderOutcomes({
        ...OUTCOMES,
        declared: [
          ...OUTCOMES.declared,
          { ...declared('back', 'stay'), kind: 'returnTo' },
          {
            route: null,
            interaction: 'session-guard',
            outcome: 'signedOut',
            kind: 'external',
            to: 'idp',
            global: true,
            triggered: false,
            file: '@qits/angular/src/lib/sign-in/qits-session.ts',
          },
        ] satisfies DeclaredOutcome[],
      });
      const tab = inboundTab(fixture, element);
      expect(
        [...tab.querySelectorAll('h3.outcome-group')].map((h) => h.textContent?.trim()),
      ).toEqual(['Leaves without a fixed target']);
      expect([...tab.querySelectorAll('ul.unfixed li.outcome-source')].map(leaves)).toEqual([
        '/projects/:slug/repositories repositories:back returns to the page it started from',
        'App-wide session-guard:signedOut leaves the app for idp',
      ]);
    });

    it('opens the shared outcomes in scope under the route’s own, by layout then app-wide (qits-2049)', async () => {
      const { fixture, element } = await renderOutcomes();
      const toggle = element.querySelector<HTMLButtonElement>('aside .shared-toggle')!;
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      // Those whose trigger the shown state shows (qits-2080): the toasts' is in no screenshot.
      expect(
        [...element.querySelectorAll('aside h4.shared-group')].map((h) => h.textContent?.trim()),
      ).toEqual(['/ and below']);
      expect(
        [...element.querySelectorAll('aside .shared-outcomes li.outcome')].map(leaves),
      ).toEqual(['shell · signed-out exit → /projects signs out']);
      // The route's own outcomes are listed once, above.
      expect(element.querySelectorAll('aside .route-outcomes li.outcome')).toHaveLength(1);
      toggle.click();
      fixture.detectChanges();
      expect(element.querySelectorAll('aside .shared-outcomes')).toHaveLength(0);
    });

    it('says where a return and an external lead, asks no trigger of an untriggered one, and names the library (qits-2044)', async () => {
      const library = '@qits/angular/src/lib/sign-in/auth-callback.page.ts';
      const section = {
        declared: [
          {
            route: REPOSITORIES,
            interaction: 'sign-in',
            outcome: 'succeeded',
            kind: 'returnTo',
            to: null,
            global: false,
            triggered: false,
            file: library,
          },
          {
            route: REPOSITORIES,
            interaction: 'repositories',
            outcome: 'left',
            kind: 'external',
            to: 'githost',
            global: false,
            file: 'src/app/routes/projects/[slug]/repositories/project-repositories.page.ts',
          },
          {
            route: null,
            interaction: 'session-guard',
            outcome: 'signedOut',
            kind: 'external',
            to: 'idp',
            global: true,
            triggered: false,
            file: '@qits/angular/src/lib/sign-in/qits-session.ts',
          },
        ] satisfies DeclaredOutcome[],
        fired: [{ ...fired('signs in', 'sign-in', 'succeeded'), kind: 'returnTo' }],
      };
      // The whole route's, as a bundle older than per-screenshot outcomes shows them (qits-2080).
      const { fixture, element } = await renderOutcomes(section, withoutTriggers(section));
      expect([...element.querySelectorAll('aside li.outcome')].map(leaves)).toEqual([
        'repositories · left external leaves the app for githost No test reaches this No screenshot shows its trigger',
        'sign-in · succeeded returnTo returns to the page it started from Declared by @qits/angular signs in',
      ]);
      const succeeded = row(element, 'sign-in:succeeded');
      expect(succeeded.querySelector('.outcome-target')).toBeNull();
      expect(succeeded.querySelector('.outcome-library')?.getAttribute('title')).toBe(library);
      expect(succeeded.querySelector('a')).toBeNull();
      element.querySelector<HTMLButtonElement>('aside .shared-toggle')!.click();
      fixture.detectChanges();
      expect(
        [...element.querySelectorAll('aside .shared-outcomes li.outcome')].map(leaves),
      ).toEqual([
        'session-guard · signedOut external leaves the app for idp Declared by @qits/angular No test reaches this',
      ]);
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

    it('opens a state that shows the trigger, and highlights it there', async () => {
      const { fixture, element, page } = await renderOutcomes();
      loadFrame(page, TRIGGER);
      element.querySelector<HTMLButtonElement>('aside .unseen-toggle')!.click();
      fixture.detectChanges();
      unseen(element, 'repositories:refused')
        .querySelector<HTMLButtonElement>('.shown-in')!
        .click();
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      const doc = loadFrame(page, '<form data-qits-outcome="repositories:refused">x</form>');
      row(element, 'repositories:refused')
        .querySelector<HTMLButtonElement>('.outcome-pick')!
        .click();
      fixture.detectChanges();
      expect(doc.querySelector('form')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(element.querySelector('.link-notice')).toBeNull();

      // A freeze that lists the trigger without the element says so.
      loadFrame(page, '<p>no mark</p>');
      fixture.detectChanges();
      expect(element.querySelector('.link-notice')?.textContent?.trim()).toBe(
        'This screenshot has no element for repositories:refused.',
      );
    });

    /** The line above the frame's notice, or null when it says nothing (qits-2072). */
    const notice = (element: HTMLElement) =>
      element.querySelector('.notice-line .link-notice')?.textContent?.trim() ?? null;

    /** The Outcomes tab opened on `/projects`'s sources; the result clicks the one naming `mark`. */
    function projectsSources(fixture: { detectChanges(): void }, element: HTMLElement) {
      const projects = inboundRow(inboundTab(fixture, element), 'projects');
      projects.querySelector<HTMLButtonElement>('button.inbound')!.click();
      fixture.detectChanges();
      return (mark: string) => {
        [...projects.querySelectorAll<HTMLButtonElement>('li.outcome-source button.source')]
          .find((b) => b.textContent?.includes(mark))!
          .click();
      };
    }

    /** Clicks the state tab named `name`. */
    function stateTab(element: HTMLElement, name: string): void {
      [...element.querySelectorAll<HTMLButtonElement>('[aria-label="States"] [role="tab"]')]
        .find((tab) => tab.firstChild?.textContent?.trim() === name)!
        .click();
    }

    const SHELL = '<nav data-qits-outcome="shell:signed-out">x</nav>';

    it('reserves the notice line above the frame while there is no notice (qits-2072)', async () => {
      const { element } = await renderOutcomes();
      const line = element.querySelector('.notice-line')!;
      expect(line).not.toBeNull();
      expect(line.classList).toContain('h-4');
      expect(line.nextElementSibling?.classList).toContain('frame-box');
      expect(line.textContent?.trim()).toBe('');
      expect(element.querySelector('.link-notice')).toBeNull();
    });

    it('draws a source’s trigger shown only in another freeze once that freeze’s srcdoc is in, past its about:blank load (qits-2072)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      stateTab(element, 'loaded');
      await navigated(fixture);
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      const loaded = loadFrame(page, '<p>loaded</p>');
      const pick = projectsSources(fixture, element);

      // `opened`'s trigger is in `error` only: the switch's load draws it, not `loaded`'s document.
      pick('repositories:opened');
      await navigated(fixture);
      expect(query()).toEqual({ state: 'error' });
      expect(loaded.querySelector('style[data-qits-builder]')).toBeNull();
      // The new frame's initial document is no freeze's: nothing is judged in it.
      const blank = loadFrame(page, '', 'about:blank');
      fixture.detectChanges();
      expect(blank.querySelector('style[data-qits-builder]')).toBeNull();
      expect(notice(element)).toBeNull();
      const doc = loadFrame(page, TRIGGER);
      fixture.detectChanges();
      expect(doc.querySelector('button')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(element.querySelector('.link-notice')).toBeNull();
    });

    it('says a trigger is missing only for a freeze that lists it, and forgets it on a draw that finds it (qits-2072)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      loadFrame(page, '<p>none</p>');
      row(element, 'repositories:opened')
        .querySelector<HTMLButtonElement>('.outcome-pick')!
        .click();
      fixture.detectChanges();
      expect(notice(element)).toBe('This screenshot has no element for repositories:opened.');

      // An about:blank document is no freeze's: the notice stays as the last freeze left it.
      loadFrame(page, '<p>none</p>', 'about:blank');
      fixture.detectChanges();
      expect(notice(element)).toBe('This screenshot has no element for repositories:opened.');

      const doc = loadFrame(page, TRIGGER);
      fixture.detectChanges();
      expect(doc.querySelector('button')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(notice(element)).toBeNull();

      // `loaded` does not list `opened`: its document lacking it says nothing.
      stateTab(element, 'loaded');
      await navigated(fixture);
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      loadFrame(page, '<p>loaded</p>');
      fixture.detectChanges();
      expect(notice(element)).toBeNull();
    });

    it('judges the notice for the freeze each step of the history shows (qits-2072)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      const router = TestBed.inject(Router);
      const base = router.url.split('?')[0];
      loadFrame(page, '<p>error</p>');
      projectsSources(fixture, element)('shell:signed-out');
      fixture.detectChanges();
      expect(query()).toEqual({});
      expect(notice(element)).toBe('This screenshot has no element for shell:signed-out.');

      stateTab(element, 'loaded');
      await navigated(fixture);
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      expect(notice(element)).toBeNull();
      let doc = loadFrame(page, SHELL);
      fixture.detectChanges();
      expect(doc.querySelector('nav')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(notice(element)).toBeNull();

      // Back, as history goes: the URL alone changes, no click.
      await router.navigateByUrl(base);
      await navigated(fixture);
      expect(query()).toEqual({});
      expect(notice(element)).toBeNull();
      loadFrame(page, '<p>error</p>');
      fixture.detectChanges();
      expect(notice(element)).toBe('This screenshot has no element for shell:signed-out.');

      // Forward: the previous step's notice does not come along.
      await router.navigateByUrl(`${base}?state=loaded`);
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      expect(notice(element)).toBeNull();
      doc = loadFrame(page, SHELL);
      fixture.detectChanges();
      expect(doc.querySelector('nav')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      expect(notice(element)).toBeNull();
    });

    it('keeps the shown freeze among those showing a source’s trigger (qits-2072)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      // `error` sorts first of the two showing `shell:signed-out`; `loaded` is the one shown.
      stateTab(element, 'loaded');
      await navigated(fixture);
      http.expectOne(fileUrl(LOADED_FREEZE)).flush('<p>loaded</p>');
      await settle();
      fixture.detectChanges();
      const doc = loadFrame(page, SHELL);
      projectsSources(fixture, element)('shell:signed-out');
      await navigated(fixture);
      expect(query()).toEqual({ state: 'loaded' });
      expect(doc.querySelector('nav')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
    });

    it('scrolls only the frame’s own document to the trigger, never with scrollIntoView (qits-2072)', async () => {
      const { fixture, element, page } = await renderOutcomes();
      const doc = loadFrame(page, TRIGGER);
      const scroller = { scrollTop: 100 };
      Object.defineProperty(doc, 'scrollingElement', { configurable: true, value: scroller });
      Object.defineProperty(doc, 'defaultView', {
        configurable: true,
        value: { innerHeight: 400 },
      });
      doc.querySelector('button')!.getBoundingClientRect = () =>
        ({ top: 300, height: 40 }) as DOMRect;
      const proto = Element.prototype as { scrollIntoView?: Element['scrollIntoView'] };
      const original = proto.scrollIntoView;
      const scrolled = vi.fn();
      proto.scrollIntoView = scrolled;
      try {
        row(element, 'repositories:opened')
          .querySelector<HTMLButtonElement>('.outcome-pick')!
          .click();
        fixture.detectChanges();
      } finally {
        if (original) proto.scrollIntoView = original;
        else delete proto.scrollIntoView;
      }
      expect(doc.querySelector('button')!.hasAttribute('data-qits-builder-highlight')).toBe(true);
      // 300px down a frame scrolled 100px: its 40px centred in a 400px window.
      expect(scroller.scrollTop).toBe(220);
      expect(
        (scrolled.mock.contexts as Element[]).filter((context) => context.ownerDocument === doc),
      ).toEqual([]);
    });

    it('opens the state a stay’s result was shot in', async () => {
      const { fixture, element } = await renderOutcomes(OUTCOMES, withoutTriggers());
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
