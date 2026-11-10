import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  asManifest,
  initialRoute,
  inlineAssets,
  inOutcomeScope,
  matchRoute,
  routeCalls,
  routeFreezes,
  routeOutcomes,
  routeTree,
  sharedOutcomes,
  type DeclaredOutcome,
  type FiredOutcome,
  type Freeze,
  type RoutesManifest,
} from './routes-manifest';

/** The recorded bundle's manifest: a root layout, three routes, a redirect, `**`, three freezes. */
const RECORDED = masters.body<RoutesManifest>('a published routes bundle', 'getDocsFile');

const REPOSITORIES = 'projects/:slug/repositories';

const CREATE = 'projects/:slug/work/create';
const DETAIL = 'projects/:slug/work/detail/:id';
const WORK = 'projects/:slug/work';
const SPEC = 'src/app/routes/projects/[slug]/work/create/work-create.page.browser.spec.ts';

/** A freeze of the outcomes manifest, by its route and name. */
const shot = (route: string | null, name: string, triggers?: string[]): Freeze => ({
  file: `${route ?? 'none'}/${name}.html`,
  name,
  route,
  records: [],
  ...(triggers ? { triggers } : {}),
});

/** A page outcome of the work-create page. */
const page = (
  outcome: string,
  kind: 'exit' | 'stay',
  to: string | null = null,
): DeclaredOutcome => ({
  route: CREATE,
  interaction: 'create-work-item',
  outcome,
  kind,
  to,
  global: false,
  file: 'src/app/routes/projects/[slug]/work/create/work-create.page.ts',
});

/** A fire of `outcome` by the test `test`, on `route`, shot as `freeze`. */
const fire = (
  test: string,
  interaction: string,
  outcome: string,
  route: string | null,
  freeze: string | null = null,
): FiredOutcome => ({
  spec: SPEC,
  test,
  route,
  interaction,
  outcome,
  kind: 'stay',
  freeze,
});

const FORM = shot(CREATE, 'form', ['create-work-item:created', 'create-work-item:refused']);
const REFUSED = shot(CREATE, 'refused', ['create-work-item:refused']);
const ITEM = shot(DETAIL, 'loaded', ['shell:sign-out', 'work-tabs:switched']);
const LIST = shot('projects', 'list', ['shell:sign-out']);
const OLD = shot('projects', 'old');

const SIGN_OUT: DeclaredOutcome = {
  route: null,
  interaction: 'shell',
  outcome: 'sign-out',
  kind: 'exit',
  to: 'projects',
  global: true,
  file: 'src/app/layout/shell/shell.layout.ts',
};

const SWITCHED: DeclaredOutcome = {
  route: WORK,
  interaction: 'work-tabs',
  outcome: 'switched',
  kind: 'stay',
  to: null,
  global: true,
  file: 'src/app/routes/projects/[slug]/work/work.layout.ts',
};

const OUTCOMES_SECTION = {
  declared: [
    page('refused', 'stay'),
    page('created', 'exit', DETAIL),
    page('lost', 'exit', 'nowhere'),
    page('cancelled', 'exit', WORK),
    page('empty', 'stay'),
    SWITCHED,
    SIGN_OUT,
  ],
  fired: [
    fire('creates the item', 'create-work-item', 'created', CREATE),
    fire('refuses an empty title', 'create-work-item', 'refused', CREATE),
    fire('refuses a long title', 'create-work-item', 'refused', CREATE, REFUSED.file),
    fire('refuses a long title', 'create-work-item', 'refused', CREATE, FORM.file),
    // Out of the page's scope: another route fired the same name.
    fire('refuses elsewhere', 'create-work-item', 'refused', 'projects', LIST.file),
    fire('signs out', 'shell', 'sign-out', 'projects'),
    fire('switches tabs', 'work-tabs', 'switched', `${WORK}/in-progress`),
  ],
};

/** A manifest with outcomes (qits-2006): work-create's page outcomes, a layout's and the shell's. */
const OUTCOMES: RoutesManifest = {
  routes: [
    {
      path: '',
      fullPath: '',
      children: [
        { path: 'projects', fullPath: 'projects' },
        { path: CREATE, fullPath: CREATE },
        { path: DETAIL, fullPath: DETAIL },
        {
          path: WORK,
          fullPath: WORK,
          children: [
            { path: '', fullPath: WORK, redirectTo: 'in-progress' },
            { path: 'in-progress', fullPath: `${WORK}/in-progress` },
          ],
        },
      ],
    },
    { path: '**', fullPath: '**' },
  ],
  freezes: [FORM, REFUSED, ITEM, LIST, OLD],
  byRoute: {
    [CREATE]: [FORM.file, REFUSED.file],
    [DETAIL]: [ITEM.file],
    projects: [LIST.file, OLD.file],
  },
  outcomes: OUTCOMES_SECTION,
};

describe('asManifest', () => {
  it('takes a manifest with the manifest’s shape', () => {
    expect(asManifest(RECORDED)).toEqual(RECORDED);
  });

  it('reads a bundle older than outcomes without them (qits-2006)', () => {
    const manifest = asManifest(RECORDED);
    expect(manifest).not.toHaveProperty('outcomes');
    expect(manifest?.freezes.every((freeze) => freeze.triggers === undefined)).toBe(true);
  });

  it('keeps the outcomes and each freeze’s triggers (qits-2006)', () => {
    expect(asManifest(OUTCOMES)).toEqual(OUTCOMES);
    expect(asManifest({ ...OUTCOMES, outcomes: { declared: [], fired: [] } })?.outcomes).toEqual({
      declared: [],
      fired: [],
    });
  });

  it('reads a malformed outcomes section as invalid, and keeps the routes (qits-2006)', () => {
    const declared = OUTCOMES_SECTION.declared;
    for (const outcomes of [
      'x',
      [],
      { declared },
      { declared: 'x', fired: [] },
      { declared: [{ ...declared[0], kind: 'leave' }], fired: [] },
      { declared: [{ ...declared[0], global: 'no' }], fired: [] },
      { declared, fired: [{ spec: 's', test: 't' }] },
    ]) {
      const manifest = asManifest({ ...OUTCOMES, outcomes });
      expect(manifest?.outcomes).toBe('invalid');
      expect(manifest?.routes).toEqual(OUTCOMES.routes);
      expect(manifest?.freezes).toEqual(OUTCOMES.freezes);
    }
    const badTriggers = asManifest({
      ...OUTCOMES,
      freezes: [{ ...OUTCOMES.freezes[0], triggers: [1] }, ...OUTCOMES.freezes.slice(1)],
    });
    expect(badTriggers?.outcomes).toBe('invalid');
    expect(badTriggers?.freezes[0]).not.toHaveProperty('triggers');
    expect(badTriggers?.freezes.map((freeze) => freeze.file)).toEqual(
      OUTCOMES.freezes.map((freeze) => freeze.file),
    );
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

describe('inOutcomeScope', () => {
  it('takes a page’s own route only, and null for the root page', () => {
    expect(inOutcomeScope({ route: CREATE, global: false }, CREATE)).toBe(true);
    expect(inOutcomeScope({ route: CREATE, global: false }, `${CREATE}/x`)).toBe(false);
    expect(inOutcomeScope({ route: CREATE, global: false }, null)).toBe(false);
    expect(inOutcomeScope({ route: '', global: false }, null)).toBe(true);
    expect(inOutcomeScope({ route: '', global: false }, '')).toBe(true);
    expect(inOutcomeScope({ route: '', global: false }, 'projects')).toBe(false);
  });

  it('takes a layout’s route and its subtree, and the root layout everything', () => {
    expect(inOutcomeScope({ route: WORK, global: true }, WORK)).toBe(true);
    expect(inOutcomeScope({ route: WORK, global: true }, `${WORK}/in-progress`)).toBe(true);
    expect(inOutcomeScope({ route: WORK, global: true }, `${WORK}-archive`)).toBe(false);
    expect(inOutcomeScope({ route: WORK, global: true }, null)).toBe(false);
    expect(inOutcomeScope({ route: '', global: true }, 'projects')).toBe(true);
    expect(inOutcomeScope({ route: '', global: true }, null)).toBe(true);
  });

  it('takes every route, and null, for an app-wide outcome', () => {
    expect(inOutcomeScope({ route: null, global: true }, 'projects')).toBe(true);
    expect(inOutcomeScope({ route: null, global: true }, null)).toBe(true);
  });
});

describe('routeOutcomes', () => {
  const byOutcome = () =>
    Object.fromEntries(routeOutcomes(OUTCOMES, CREATE).map((o) => [o.declared.outcome, o]));

  it('lists the route’s page outcomes by interaction then outcome, never a shared one', () => {
    expect(routeOutcomes(OUTCOMES, CREATE).map((o) => o.mark)).toEqual([
      'create-work-item:cancelled',
      'create-work-item:created',
      'create-work-item:empty',
      'create-work-item:lost',
      'create-work-item:refused',
    ]);
    expect(routeOutcomes(OUTCOMES, WORK)).toEqual([]);
    expect(routeOutcomes(OUTCOMES, 'projects')).toEqual([]);
  });

  it('joins the tests that reach it in its scope, once each', () => {
    const { created, refused, empty } = byOutcome();
    expect(created.reachedBy).toEqual([{ spec: SPEC, test: 'creates the item' }]);
    expect(refused.reachedBy).toEqual([
      { spec: SPEC, test: 'refuses an empty title' },
      { spec: SPEC, test: 'refuses a long title' },
    ]);
    expect(empty.reachedBy).toEqual([]);
  });

  it('resolves a stay’s result to the freeze shot after the first fire that has one', () => {
    const { refused, empty, created } = byOutcome();
    expect(refused.result).toEqual(REFUSED);
    expect(empty.result).toBeNull();
    // An exit has no result to show: it leaves the page.
    expect(created.result).toBeNull();
  });

  it('lists the freezes that show its trigger, by name', () => {
    const { refused, created, empty } = byOutcome();
    expect(refused.triggerFreezes).toEqual([FORM, REFUSED]);
    expect(created.triggerFreezes).toEqual([FORM]);
    expect(empty.triggerFreezes).toEqual([]);
  });

  it('matches an exit’s target, through a redirect, and names one no route takes', () => {
    const { created, cancelled, lost, refused } = byOutcome();
    expect(created.target).toEqual({ kind: 'route', fullPath: DETAIL });
    expect(cancelled.target).toEqual({ kind: 'route', fullPath: `${WORK}/in-progress` });
    expect(lost.target).toEqual({ kind: 'unmatched', path: '/nowhere' });
    expect(refused.target).toBeNull();
  });

  it('has none without a readable outcomes section', () => {
    expect(routeOutcomes(RECORDED, REPOSITORIES)).toEqual([]);
    expect(routeOutcomes({ ...OUTCOMES, outcomes: 'invalid' }, CREATE)).toEqual([]);
  });
});

describe('sharedOutcomes', () => {
  it('groups the layouts’ and app-wide outcomes by scope, app-wide first', () => {
    const groups = sharedOutcomes(OUTCOMES);
    expect(groups.map((group) => [group.route, group.outcomes.map((o) => o.mark)])).toEqual([
      [null, ['shell:sign-out']],
      [WORK, ['work-tabs:switched']],
    ]);
    const [signOut] = groups[0].outcomes;
    expect(signOut.reachedBy).toEqual([{ spec: SPEC, test: 'signs out' }]);
    expect(signOut.target).toEqual({ kind: 'route', fullPath: 'projects' });
    // By name with no route selected: `list`, then `loaded`.
    expect(signOut.triggerFreezes).toEqual([LIST, ITEM]);
    const [switched] = groups[1].outcomes;
    // Fired and shown below the layout's route (in-progress, the detail), so in its scope.
    expect(switched.reachedBy).toEqual([{ spec: SPEC, test: 'switches tabs' }]);
    expect(switched.triggerFreezes).toEqual([ITEM]);
  });

  it('sorts the selected route’s own freezes first', () => {
    const [signOut] = sharedOutcomes(OUTCOMES, DETAIL)[0].outcomes;
    expect(signOut.triggerFreezes).toEqual([ITEM, LIST]);
  });

  it('has none without a readable outcomes section', () => {
    expect(sharedOutcomes(RECORDED)).toEqual([]);
    expect(sharedOutcomes({ ...OUTCOMES, outcomes: 'invalid' })).toEqual([]);
  });
});
