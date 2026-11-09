import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  asManifest,
  initialRoute,
  inlineAssets,
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
