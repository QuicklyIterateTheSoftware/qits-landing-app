import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  asManifest,
  initialRoute,
  inlineAssets,
  matchRoute,
  routeCalls,
  routeFreezes,
  routeTree,
  type RoutesManifest,
} from './routes-manifest';

/** The recorded bundle's manifest: a root layout, three routes, a redirect, `**`, three freezes. */
const RECORDED = masters.body<RoutesManifest>('a published routes bundle', 'getDocsFile');

const REPOSITORIES = 'projects/:slug/repositories';

describe('asManifest', () => {
  it('takes a manifest with the manifest’s shape', () => {
    expect(asManifest(RECORDED)).toEqual(RECORDED);
  });

  it('refuses anything else', () => {
    expect(asManifest(null)).toBeNull();
    expect(asManifest([])).toBeNull();
    expect(asManifest({ ...RECORDED, routes: 'x' })).toBeNull();
    expect(asManifest({ ...RECORDED, freezes: [{ file: 'a.html' }] })).toBeNull();
    expect(asManifest({ ...RECORDED, byRoute: { x: [1] } })).toBeNull();
    expect(
      asManifest({ ...RECORDED, routes: [{ path: '', fullPath: '', children: [{}] }] }),
    ).toBeNull();
  });
});

describe('routeTree', () => {
  it('lays the recorded routes out by path segment, in tree order', () => {
    expect(routeTree(RECORDED)).toEqual([
      // The root layout and its `''` child are one row; the child redirects.
      { segment: '/', fullPath: '', depth: 0, kind: 'redirect', redirectTo: 'projects', states: 0 },
      { segment: 'projects', fullPath: 'projects', depth: 1, kind: 'route', states: 0 },
      { segment: ':slug', fullPath: 'projects/:slug', depth: 2, kind: 'segment', states: 0 },
      { segment: 'repositories', fullPath: REPOSITORIES, depth: 3, kind: 'route', states: 2 },
      {
        segment: 'workspaces',
        fullPath: 'projects/:slug/workspaces',
        depth: 3,
        kind: 'redirect',
        redirectTo: 'projects/:slug/agents',
        states: 0,
      },
      { segment: '**', fullPath: '**', depth: 1, kind: 'wildcard', states: 0 },
    ]);
  });

  it("merges a layout with its `''` child page, which makes it a route", () => {
    const manifest: RoutesManifest = {
      routes: [
        {
          path: 'agents/:agentId',
          fullPath: 'agents/:agentId',
          children: [
            { path: '', fullPath: 'agents/:agentId' },
            { path: 'chat', fullPath: 'agents/:agentId/chat' },
          ],
        },
      ],
      freezes: [],
      byRoute: { 'agents/:agentId/chat': ['a.html'] },
    };
    expect(routeTree(manifest).map(({ segment, kind, states }) => [segment, kind, states])).toEqual(
      [
        ['/', 'segment', 0],
        ['agents', 'segment', 0],
        [':agentId', 'route', 0],
        ['chat', 'route', 1],
      ],
    );
  });
});

describe('initialRoute', () => {
  it('opens on the first route with states', () => {
    expect(initialRoute(routeTree(RECORDED))).toBe(REPOSITORIES);
  });

  it('opens on the first route when none has states', () => {
    expect(initialRoute(routeTree({ ...RECORDED, byRoute: {} }))).toBe('projects');
  });
});

describe('routeFreezes and routeCalls', () => {
  it('lists a route’s freezes by name, and their calls once each, sorted', () => {
    expect(routeFreezes(RECORDED, REPOSITORIES).map((freeze) => freeze.name)).toEqual([
      'error',
      'loaded',
    ]);
    expect(routeCalls(RECORDED, REPOSITORIES)).toEqual([
      {
        provider: 'qits-projects-service',
        operationId: 'listProjectRepositories',
        state: 'a project with repositories',
      },
      { provider: 'qits-projects-service', operationId: 'listProjects', state: 'a project exists' },
    ]);
  });

  it('has none for a route without states', () => {
    expect(routeFreezes(RECORDED, 'projects')).toEqual([]);
    expect(routeCalls(RECORDED, 'projects')).toEqual([]);
  });
});

describe('matchRoute', () => {
  /** The landing app's route tree (`freezes/manifest.json`), reduced to the routes these cases meet. */
  const LANDING: RoutesManifest = {
    routes: [
      { path: 'auth/callback', fullPath: 'auth/callback' },
      {
        path: '',
        fullPath: '',
        children: [
          { path: '', fullPath: '' },
          { path: 'projects', fullPath: 'projects' },
          { path: 'projects/:slug', fullPath: 'projects/:slug' },
          { path: 'projects/:slug/work/detail/:id', fullPath: 'projects/:slug/work/detail/:id' },
          {
            path: 'projects/:slug/work/detail/:id/agent',
            fullPath: 'projects/:slug/work/detail/:id/agent',
            children: [
              { path: '', fullPath: 'projects/:slug/work/detail/:id/agent' },
              { path: ':tab', fullPath: 'projects/:slug/work/detail/:id/agent/:tab' },
            ],
          },
          {
            path: 'projects/:slug/work',
            fullPath: 'projects/:slug/work',
            children: [
              { path: '', fullPath: 'projects/:slug/work', redirectTo: 'in-progress' },
              { path: 'in-progress', fullPath: 'projects/:slug/work/in-progress' },
            ],
          },
          { path: 'projects/:slug/agents', fullPath: 'projects/:slug/agents' },
          {
            path: 'projects/:slug/agents/:agentId',
            fullPath: 'projects/:slug/agents/:agentId',
            children: [
              { path: '', fullPath: 'projects/:slug/agents/:agentId' },
              { path: 'chat', fullPath: 'projects/:slug/agents/:agentId/chat' },
            ],
          },
          {
            path: 'projects/:slug/workspaces',
            fullPath: 'projects/:slug/workspaces',
            redirectTo: 'projects/:slug/agents',
          },
          {
            path: 'projects/:slug/release-requests/:requestId',
            fullPath: 'projects/:slug/release-requests/:requestId',
          },
        ],
      },
      { path: '**', fullPath: '**' },
    ],
    freezes: [],
    byRoute: {},
  };
  const UUID = '00000000-0000-4000-8000-000000000001';
  const route = (fullPath: string) => ({ kind: 'route', fullPath });
  const match = (href: string) => matchRoute(LANDING, href);

  it('selects the route a path ends on, a layout’s child deciding', () => {
    expect(match('/')).toEqual(route(''));
    expect(match('/projects')).toEqual(route('projects'));
    expect(match('/projects/contract-00000001')).toEqual(route('projects/:slug'));
    expect(match('/projects/contract-00000001/work/detail/contract-00000001-1')).toEqual(
      route('projects/:slug/work/detail/:id'),
    );
    expect(match('/projects/contract-00000001/work/detail/contract-00000001-1/agent')).toEqual(
      route('projects/:slug/work/detail/:id/agent'),
    );
    expect(match('/projects/contract-00000001/work/detail/contract-00000001-1/agent/chat')).toEqual(
      route('projects/:slug/work/detail/:id/agent/:tab'),
    );
    expect(match(`/projects/x/agents/${UUID}`)).toEqual(route('projects/:slug/agents/:agentId'));
    expect(match(`/projects/x/agents/${UUID}/chat`)).toEqual(
      route('projects/:slug/agents/:agentId/chat'),
    );
  });

  it('ends on a row the tree shows as a route', () => {
    const routes = routeTree(LANDING)
      .filter((row) => row.kind === 'route')
      .map((row) => row.fullPath);
    const hrefs = ['/', '/projects/x/work', `/projects/x/agents/${UUID}`, '/projects/x/workspaces'];
    for (const href of hrefs) {
      const target = match(href);
      expect(target.kind === 'route' && routes.includes(target.fullPath)).toBe(true);
    }
  });

  it('follows a redirect, relative to its parent or from the root, with the link’s params', () => {
    expect(match('/projects/x/work')).toEqual(route('projects/:slug/work/in-progress'));
    expect(match('/projects/x/workspaces')).toEqual(route('projects/:slug/agents'));
    expect(
      matchRoute(
        {
          ...LANDING,
          routes: [
            { path: 'old/:slug', fullPath: 'old/:slug', redirectTo: '/projects/:slug' },
            ...LANDING.routes,
          ],
        },
        '/old/x',
      ),
    ).toEqual(route('projects/:slug'));
  });

  it('drops the query and the fragment, and decodes each segment', () => {
    const request = route('projects/:slug/release-requests/:requestId');
    expect(match(`/projects/x/release-requests/${UUID}?tab=changes`)).toEqual(request);
    expect(match(`/projects/x/release-requests/${UUID}#check-fold`)).toEqual(request);
    expect(match('/projects/a%2Fb')).toEqual(route('projects/:slug'));
    expect(match('/projects/%E0%A4%A')).toEqual(route('projects/:slug'));
  });

  it('says a path no route but `**` takes is unmatched', () => {
    expect(match('/w')).toEqual({ kind: 'unmatched', path: '/w' });
    expect(match('/projects/x/nowhere?y#z')).toEqual({
      kind: 'unmatched',
      path: '/projects/x/nowhere',
    });
    expect(matchRoute({ ...LANDING, routes: [] }, '/projects')).toEqual({
      kind: 'unmatched',
      path: '/projects',
    });
  });

  it('gives up on a redirect loop', () => {
    const loop: RoutesManifest = {
      ...LANDING,
      routes: [
        { path: 'a', fullPath: 'a', redirectTo: 'b' },
        { path: 'b', fullPath: 'b', redirectTo: '/a' },
      ],
    };
    expect(matchRoute(loop, '/a')).toEqual({ kind: 'unmatched', path: '/a' });
  });

  it('tells a link outside the app, and one that stays on the page', () => {
    expect(match('https://ci.qits.wohlben.eu/x')).toEqual({ kind: 'outside' });
    expect(match('//host/x')).toEqual({ kind: 'outside' });
    expect(match('mailto:a@b')).toEqual({ kind: 'outside' });
    expect(match('#f4')).toEqual({ kind: 'fragment' });
    expect(match('?tab=x')).toEqual({ kind: 'fragment' });
    expect(match('')).toEqual({ kind: 'fragment' });
  });
});

describe('inlineAssets', () => {
  const ASSETS = { 'assets/inter-latin-400-normal.woff2': 'data:font/woff2;base64,AAAA' };

  it('replaces a relative reference to a bundle asset by its data: URL', () => {
    const html =
      '<style>@font-face{src:url("../../../assets/inter-latin-400-normal.woff2") format("woff2")}' +
      'b{background:url(\'assets/inter-latin-400-normal.woff2\')}</style><img src="../assets/inter-latin-400-normal.woff2">';
    expect(inlineAssets(html, ASSETS)).toBe(
      '<style>@font-face{src:url("data:font/woff2;base64,AAAA") format("woff2")}' +
        'b{background:url("data:font/woff2;base64,AAAA")}</style><img src="data:font/woff2;base64,AAAA">',
    );
  });

  it('leaves other references as they are', () => {
    const html =
      '<style>a{background:url("../assets/missing.png")}b{background:url(https://x.test/assets/a.woff2)}' +
      'c{background:url(/assets/inter-latin-400-normal.woff2)}</style><a href="/projects/x">x</a>';
    expect(inlineAssets(html, ASSETS)).toBe(html);
  });
});
