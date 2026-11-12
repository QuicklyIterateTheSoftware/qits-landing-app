import { artifactsGoldenMasters as masters } from '../../../testing/golden-masters';
import {
  answeringRow,
  appWideCalls,
  asManifest,
  callKey,
  freezeCalls,
  freezeResults,
  forwardExits,
  inboundExits,
  joinedOutcome,
  unfixedOutcomes,
  unreachable,
  initialRoute,
  inlineAssets,
  inOutcomeScope,
  matchRoute,
  outcomeLeads,
  outcomeProgress,
  routeFreezes,
  routeOutcomeMarks,
  routeOutcomes,
  routeStates,
  routeTree,
  hasViewports,
  sharedOutcomes,
  stateFreeze,
  type DeclaredOutcome,
  type FiredOutcome,
  type Freeze,
  type ManifestRoute,
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
      { declared: [{ ...declared[0], triggered: 'no' }], fired: [] },
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

const AGENT = `${DETAIL}/agent`;
const TAB = `${AGENT}/:tab`;
const CHAT = 'projects/:slug/agents/:agentId/chat';

/** An untriggered exit of the agent layout, declared for its route and below (qits-2076). */
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

const WAITING = shot(AGENT, 'waiting');
const TAB_WAITING = shot(TAB, 'tab-waiting');

/**
 * The work item's agent layout (qits-2076): it only forwards (`forward`), and its `''` and `:tab`
 * children render nothing. Its exits lead to the chat, the item and a route the app lacks; the item
 * declares an exit of its own.
 */
const FORWARD: RoutesManifest = {
  routes: [
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
    { path: CHAT, fullPath: CHAT },
  ],
  freezes: [WAITING, TAB_WAITING],
  byRoute: { [AGENT]: [WAITING.file], [TAB]: [TAB_WAITING.file] },
  outcomes: {
    declared: [
      follow('toItem', DETAIL),
      follow('toAgentChat', 'projects/:slug/agents/:agentId/chat'),
      follow('toAgentGone', 'projects/:slug/agents/:agentId/gone'),
      { ...page('created', 'exit', DETAIL), route: DETAIL },
    ],
    fired: [],
  },
};

/** `manifest`'s routes without `forward` and `rendersNothing`: a bundle older than them. */
const withoutForwards = (routes: readonly ManifestRoute[]): ManifestRoute[] =>
  routes.map(({ forward: _forward, rendersNothing: _nothing, children, ...route }) => ({
    ...route,
    ...(children ? { children: withoutForwards(children) } : {}),
  }));

describe('routes that render nothing and forwards (qits-2076)', () => {
  it('folds a route that renders nothing into its parent’s row, which stays a route', () => {
    const rows = routeTree(FORWARD);
    expect(rows.map((row) => row.fullPath)).not.toContain(TAB);
    expect(rows.find((row) => row.fullPath === AGENT)).toEqual({
      segment: 'agent',
      fullPath: AGENT,
      depth: 6,
      kind: 'route',
      states: 2,
      alsoAnswers: [TAB],
      forward: true,
    });
    // The rest carry neither field.
    expect(
      rows
        .filter((row) => row.fullPath !== AGENT)
        .some((row) => 'alsoAnswers' in row || 'forward' in row),
    ).toBe(false);
  });

  it('selects the row a folded address folds into', () => {
    const rows = routeTree(FORWARD);
    expect(answeringRow(rows, TAB)?.fullPath).toBe(AGENT);
    expect(answeringRow(rows, AGENT)?.fullPath).toBe(AGENT);
    expect(answeringRow(rows, DETAIL)?.fullPath).toBe(DETAIL);
    // A segment and an address nothing answers have no row.
    expect(answeringRow(rows, 'projects')).toBeUndefined();
    expect(answeringRow(rows, 'nowhere')).toBeUndefined();
  });

  it('lays a manifest without the fields out as before', () => {
    const old = { ...FORWARD, routes: withoutForwards(FORWARD.routes) };
    const rows = routeTree(old);
    expect(rows.map(({ segment, kind, states }) => [segment, kind, states]).slice(6, 8)).toEqual([
      ['agent', 'route', 1],
      [':tab', 'route', 1],
    ]);
    expect(rows.some((row) => 'alsoAnswers' in row || 'forward' in row)).toBe(false);
    expect(answeringRow(rows, TAB)?.fullPath).toBe(TAB);
    expect(routeTree(RECORDED).some((row) => 'alsoAnswers' in row || 'forward' in row)).toBe(false);
  });

  it('shows the folded addresses’ states on the row that answers them', () => {
    expect(routeStates(FORWARD, AGENT).map((state) => state.name)).toEqual(['waiting']);
    expect(routeStates(FORWARD, AGENT, [TAB]).map((state) => state.name)).toEqual([
      'tab-waiting',
      'waiting',
    ]);
  });

  it('lists a forward’s exits with their targets, by interaction and outcome', () => {
    expect(
      forwardExits(FORWARD, AGENT).map(({ declared, target }) => [declared.outcome, target]),
    ).toEqual([
      ['toAgentChat', { kind: 'route', fullPath: CHAT }],
      ['toAgentGone', { kind: 'unmatched', path: '/projects/:slug/agents/:agentId/gone' }],
      ['toItem', { kind: 'route', fullPath: DETAIL }],
    ]);
    expect(forwardExits(FORWARD, DETAIL).map(({ declared }) => declared.outcome)).toEqual([
      'created',
    ]);
    expect(forwardExits({ ...FORWARD, outcomes: 'invalid' }, AGENT)).toEqual([]);
  });

  it('takes the fields as `true` only', () => {
    expect(asManifest(FORWARD)).toEqual(FORWARD);
    const agent = FORWARD.routes[0].children![1];
    for (const changed of [
      { ...agent, forward: false },
      { ...agent, rendersNothing: 'yes' },
    ]) {
      const routes = [
        { ...FORWARD.routes[0], children: [FORWARD.routes[0].children![0], changed] },
      ];
      expect(asManifest({ ...FORWARD, routes })).toBeNull();
    }
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

describe('routeFreezes', () => {
  it('lists a route’s freezes by name', () => {
    expect(routeFreezes(RECORDED, REPOSITORIES).map((freeze) => freeze.name)).toEqual([
      'error',
      'loaded',
    ]);
  });

  it('has none for a route without states', () => {
    expect(routeFreezes(RECORDED, 'projects')).toEqual([]);
  });
});

describe('the selected freeze’s calls and results (qits-2080)', () => {
  const call = (provider: string, operationId: string, state = 'a state') => ({
    provider,
    operationId,
    state,
  });
  const PROJECTS = call('qits-projects-service', 'listProjects', 'a project exists');
  const REQUESTS = call('qits-projects-service', 'listProjectReleaseRequests');
  const WORK_ITEM = call('qits-projects-service', 'getWorkItem');

  /** A freeze of `route` named `name`, answering `records`, showing `triggers`. */
  const freeze = (
    route: string | null,
    name: string,
    records: Freeze['records'],
    triggers?: string[],
  ): Freeze => ({ ...shot(route, name, triggers), records });

  /**
   * Two states of the work-create page that differ in calls and triggers, and freezes of three
   * other routes: `listProjects` is recorded on all four routes, `listProjectReleaseRequests` on two
   * (exactly half), `getWorkItem` on one. A shot outside a page spec records all three.
   */
  const FORM_STATE = freeze(
    CREATE,
    'form',
    [WORK_ITEM, PROJECTS, PROJECTS, REQUESTS],
    ['create-work-item:created', 'shell:sign-out'],
  );
  const REFUSED_STATE = freeze(CREATE, 'refused', [PROJECTS], ['create-work-item:refused']);
  const MANIFEST: RoutesManifest = {
    ...OUTCOMES,
    freezes: [
      FORM_STATE,
      REFUSED_STATE,
      freeze(DETAIL, 'loaded', [PROJECTS, REQUESTS]),
      freeze('projects', 'list', [PROJECTS]),
      freeze(WORK, 'board', [{ ...PROJECTS, state: 'no project' }]),
      freeze(null, 'slots', [WORK_ITEM, REQUESTS, WORK_ITEM]),
    ],
  };

  it('lists one freeze’s calls once each, sorted by provider, operationId and state', () => {
    expect(freezeCalls(FORM_STATE)).toEqual([WORK_ITEM, REQUESTS, PROJECTS]);
    expect(freezeCalls(REFUSED_STATE)).toEqual([PROJECTS]);
    expect(
      freezeCalls(freeze(CREATE, 'x', [call('b', 'op'), call('a', 'op', 'z'), call('a', 'op')])),
    ).toEqual([call('a', 'op'), call('a', 'op', 'z'), call('b', 'op')]);
    expect(freezeCalls(freeze(CREATE, 'none', []))).toEqual([]);
  });

  it('takes a call as app-wide when more than half of the routes with freezes record it', () => {
    // listProjects: 4 of 4 routes, in any state. listProjectReleaseRequests: 2 of 4, exactly half.
    // The route-less shot is no route and adds none of its records.
    expect([...appWideCalls(MANIFEST)]).toEqual([callKey(PROJECTS)]);
    expect(appWideCalls(MANIFEST).has(callKey(REQUESTS))).toBe(false);
    expect(appWideCalls(MANIFEST).has(callKey(WORK_ITEM))).toBe(false);

    // One more route recording listProjectReleaseRequests makes it 3 of 5.
    const more = {
      ...MANIFEST,
      freezes: [...MANIFEST.freezes, freeze('projects/:slug', 'home', [REQUESTS])],
    };
    expect(appWideCalls(more)).toEqual(new Set([callKey(PROJECTS), callKey(REQUESTS)]));
  });

  it('counts each route once however many of its freezes record the call', () => {
    const one = {
      ...MANIFEST,
      freezes: [
        freeze(CREATE, 'a', [WORK_ITEM]),
        freeze(CREATE, 'b', [WORK_ITEM]),
        freeze(CREATE, 'c', [WORK_ITEM]),
        freeze(DETAIL, 'd', []),
        freeze('projects', 'e', []),
      ],
    };
    expect(appWideCalls(one).size).toBe(0);
  });

  it('has no app-wide call without a freeze on a route', () => {
    expect(appWideCalls({ ...MANIFEST, freezes: [freeze(null, 'slots', [PROJECTS])] }).size).toBe(
      0,
    );
  });

  it('finds the outcomes whose result a freeze shows by its file, once each', () => {
    // `refuses a long title` fired `refused` twice: shot as REFUSED, then as FORM.
    expect(freezeResults(OUTCOMES, REFUSED)).toEqual(['create-work-item:refused']);
    expect(freezeResults(OUTCOMES, FORM)).toEqual(['create-work-item:refused']);
    expect(freezeResults(OUTCOMES, ITEM)).toEqual([]);
    const twice = {
      ...OUTCOMES,
      outcomes: {
        ...OUTCOMES_SECTION,
        fired: [
          ...OUTCOMES_SECTION.fired,
          fire('refuses twice', 'create-work-item', 'refused', CREATE, REFUSED.file),
          fire('switches', 'work-tabs', 'switched', CREATE, REFUSED.file),
        ],
      },
    };
    expect(freezeResults(twice, REFUSED)).toEqual([
      'create-work-item:refused',
      'work-tabs:switched',
    ]);
  });

  it('finds no result without a readable outcomes section', () => {
    expect(freezeResults({ ...OUTCOMES, outcomes: undefined }, REFUSED)).toEqual([]);
    expect(freezeResults({ ...OUTCOMES, outcomes: 'invalid' }, REFUSED)).toEqual([]);
  });
});

describe('routeStates and stateFreeze (qits-2047)', () => {
  const ROUTE = 'projects/:slug/work';
  const VIEWPORTS = ['PHONE', 'TABLET', 'DESKTOP'] as const;

  /** A freeze on the work route; with `viewports`, one per width under one name. */
  const freeze = (name: string, kind?: Freeze['kind'], viewport?: Freeze['viewport']): Freeze => ({
    file: `work/${name}${viewport ? `-${viewport.toLowerCase()}` : ''}.html`,
    name,
    route: ROUTE,
    records: [],
    ...(kind === undefined ? {} : { kind }),
    ...(viewport === undefined ? {} : { viewport }),
  });
  const shotAtEveryWidth = (name: string, kind: Freeze['kind']) =>
    VIEWPORTS.map((viewport) => freeze(name, kind, viewport));

  const manifestOf = (freezes: readonly Freeze[]): RoutesManifest => ({
    routes: [{ path: ROUTE, fullPath: ROUTE }],
    freezes,
    byRoute: { [ROUTE]: freezes.map((f) => f.file) },
  });

  it('groups a route’s freezes by name, one state for the three widths of a shot', () => {
    const manifest = manifestOf([
      ...shotAtEveryWidth('loaded', 'DATA'),
      ...shotAtEveryWidth('empty', 'NO_DATA'),
    ]);
    const states = routeStates(manifest, ROUTE);
    expect(states.map((state) => [state.name, state.kind, state.freezes.length])).toEqual([
      ['loaded', 'DATA', 3],
      ['empty', 'NO_DATA', 3],
    ]);
    expect(states[0].freezes.map((f) => f.viewport)).toEqual(['PHONE', 'TABLET', 'DESKTOP']);
    expect(hasViewports(manifest)).toBe(true);
    // The tree counts states, not freezes.
    expect(routeTree(manifest).find((row) => row.fullPath === ROUTE)?.states).toBe(2);
  });

  it('takes a state’s first kind among its freezes', () => {
    const manifest = manifestOf([
      freeze('mixed', null, 'PHONE'),
      freeze('mixed', 'ERROR', 'TABLET'),
    ]);
    expect(routeStates(manifest, ROUTE).map((state) => state.kind)).toEqual(['ERROR']);
  });

  it('orders the states by kind, by name within a kind, the states without one last', () => {
    const manifest = manifestOf([
      freeze('a-unkinded'),
      freeze('z-error', 'ERROR'),
      freeze('b-pending', 'PENDING'),
      freeze('y-data', 'DATA'),
      freeze('a-error', 'ERROR'),
      freeze('c-empty', 'NO_DATA'),
      freeze('b-unkinded', null),
      freeze('x-data', 'DATA'),
    ]);
    expect(routeStates(manifest, ROUTE).map((state) => state.name)).toEqual([
      'x-data',
      'y-data',
      'c-empty',
      'b-pending',
      'a-error',
      'z-error',
      'a-unkinded',
      'b-unkinded',
    ]);
  });

  it('keeps the order by name for a bundle without kinds', () => {
    expect(routeStates(RECORDED, REPOSITORIES).map((state) => [state.name, state.kind])).toEqual([
      ['error', null],
      ['loaded', null],
    ]);
    expect(hasViewports(RECORDED)).toBe(false);
  });

  it('draws the freeze at the viewport, else the one without, else DESKTOP’s, else the first', () => {
    const [state] = routeStates(manifestOf(shotAtEveryWidth('loaded', 'DATA')), ROUTE);
    expect(stateFreeze(state, 'PHONE').viewport).toBe('PHONE');
    expect(stateFreeze(state, 'TABLET').viewport).toBe('TABLET');

    const plain = freeze('two', 'DATA');
    const [withPlain] = routeStates(manifestOf([freeze('two', 'DATA', 'PHONE'), plain]), ROUTE);
    expect(stateFreeze(withPlain, 'TABLET')).toBe(plain);

    const [desktopOnly] = routeStates(
      manifestOf([freeze('three', 'DATA', 'PHONE'), freeze('three', 'DATA', 'DESKTOP')]),
      ROUTE,
    );
    expect(stateFreeze(desktopOnly, 'TABLET').viewport).toBe('DESKTOP');

    const [phoneOnly] = routeStates(manifestOf([freeze('four', 'DATA', 'PHONE')]), ROUTE);
    expect(stateFreeze(phoneOnly, 'DESKTOP').viewport).toBe('PHONE');

    const [legacy] = routeStates(RECORDED, REPOSITORIES);
    expect(stateFreeze(legacy, 'DESKTOP').name).toBe('error');
  });

  it('reads an unknown kind or viewport as null, and keeps the bundle', () => {
    const manifest = asManifest({
      ...manifestOf([freeze('odd'), freeze('known', 'DATA', 'PHONE')]),
      freezes: [
        { ...freeze('odd'), kind: 'SOMETHING', viewport: 'WATCH' },
        freeze('known', 'DATA', 'PHONE'),
      ],
    });
    expect(manifest?.freezes.map((f) => [f.name, f.kind, f.viewport])).toEqual([
      ['odd', null, null],
      ['known', 'DATA', 'PHONE'],
    ]);
    // An absent field stays absent: an older bundle reads as it is.
    expect(asManifest(RECORDED)?.freezes[0]).not.toHaveProperty('kind');
    expect(asManifest(RECORDED)?.freezes[0]).not.toHaveProperty('viewport');
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

describe('routeOutcomeMarks (qits-2045)', () => {
  /** A page outcome of the detail page, which `ITEM` shows the triggers of when it is named. */
  const detail = (outcome: string): DeclaredOutcome => ({
    ...page(outcome, 'stay'),
    route: DETAIL,
    interaction: 'work-detail',
  });

  it('counts each route’s page outcomes and its gaps, never a shared one', () => {
    const marks = routeOutcomeMarks(OUTCOMES);
    // refused and created are reached and shown; lost, cancelled and empty are neither.
    expect(marks.get(CREATE)).toEqual({ outcomes: 5, gaps: 3 });
    // SWITCHED (the layout's) and SIGN_OUT (app-wide) mark no route.
    expect([...marks.keys()]).toEqual([CREATE]);
  });

  it('counts an outcome no test reaches as a gap', () => {
    const manifest: RoutesManifest = {
      ...OUTCOMES,
      freezes: [FORM, REFUSED, shot(DETAIL, 'loaded', ['work-detail:closed']), LIST, OLD],
      outcomes: { declared: [detail('closed')], fired: [] },
    };
    expect(routeOutcomeMarks(manifest).get(DETAIL)).toEqual({ outcomes: 1, gaps: 1 });
  });

  it('counts an outcome no freeze shows the trigger of as a gap', () => {
    const reached: RoutesManifest = {
      ...OUTCOMES,
      outcomes: {
        declared: [detail('closed')],
        fired: [fire('closes the item', 'work-detail', 'closed', DETAIL)],
      },
    };
    expect(routeOutcomeMarks(reached).get(DETAIL)).toEqual({ outcomes: 1, gaps: 1 });
    const shown: RoutesManifest = {
      ...reached,
      freezes: [FORM, REFUSED, shot(DETAIL, 'loaded', ['work-detail:closed']), LIST, OLD],
    };
    expect(routeOutcomeMarks(shown).get(DETAIL)).toEqual({ outcomes: 1, gaps: 0 });
  });

  it('is empty without a readable outcomes section', () => {
    expect(routeOutcomeMarks(RECORDED).size).toBe(0);
    expect(routeOutcomeMarks({ ...OUTCOMES, outcomes: 'invalid' }).size).toBe(0);
  });
});

describe('outcomeProgress (qits-2045)', () => {
  it('counts the route rows that declare a page outcome among all route rows', () => {
    // Route rows: the root, projects, create, detail, in-progress (work is a redirect, `**` a
    // wildcard).
    const rows = routeTree(OUTCOMES);
    expect(rows.filter((row) => row.kind === 'route').map((row) => row.fullPath)).toEqual([
      '',
      'projects',
      CREATE,
      DETAIL,
      `${WORK}/in-progress`,
    ]);
    expect(outcomeProgress(OUTCOMES, rows)).toEqual({ declaring: 1, pages: 5 });
    expect(outcomeProgress({ ...OUTCOMES, outcomes: 'invalid' }, rows)).toEqual({
      declaring: 0,
      pages: 5,
    });
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

describe('inboundExits (qits-2049)', () => {
  const rows = (manifest: RoutesManifest) =>
    inboundExits(manifest).map((row) => [
      row.fullPath,
      row.entry,
      row.inbound.map((d) => d.outcome),
    ]);

  it('lists the checked routes with the exits that lead to them, unreachable first', () => {
    // The layouts, the redirect and `**` are not checked; `cancelled` leads to the layout `work`.
    expect(rows(OUTCOMES)).toEqual([
      [CREATE, false, []],
      [`${WORK}/in-progress`, false, []],
      ['projects', false, ['sign-out']],
      [DETAIL, false, ['created']],
    ]);
    expect(inboundExits(OUTCOMES).map(unreachable)).toEqual([true, true, false, false]);
  });

  it('counts an exit from a page, a layout or app-wide, and only an exit whose `to` is exact', () => {
    const layoutExit: DeclaredOutcome = {
      ...SWITCHED,
      outcome: 'opened',
      kind: 'exit',
      to: CREATE,
    };
    const manifest: RoutesManifest = {
      ...OUTCOMES,
      outcomes: {
        declared: [
          ...OUTCOMES_SECTION.declared,
          layoutExit,
          { ...SIGN_OUT, outcome: 'wrong', to: `/${CREATE}` },
          { ...SIGN_OUT, outcome: 'back', kind: 'returnTo', to: null },
          { ...SIGN_OUT, outcome: 'left', kind: 'external', to: CREATE },
          { ...page('stayed', 'stay'), to: `${WORK}/in-progress` },
        ],
        fired: [],
      },
    };
    expect(rows(manifest)).toEqual([
      [`${WORK}/in-progress`, false, []],
      ['projects', false, ['sign-out']],
      [CREATE, false, ['opened']],
      [DETAIL, false, ['created']],
    ]);
  });

  it("takes an entry point as reached, and a parent’s `''` child as the parent", () => {
    const manifest: RoutesManifest = {
      routes: [
        { path: '', fullPath: '', entry: true },
        {
          path: 'a',
          fullPath: 'a',
          children: [
            { path: '', fullPath: 'a' },
            { path: ':tab', fullPath: 'a/:tab', entry: true },
          ],
        },
      ],
      freezes: [],
      byRoute: {},
      outcomes: { declared: [], fired: [] },
    };
    expect(rows(manifest)).toEqual([
      ['a', false, []],
      ['', true, []],
      ['a/:tab', true, []],
    ]);
    expect(asManifest(manifest)?.routes).toEqual(manifest.routes);
    expect(
      asManifest({ ...manifest, routes: [{ path: '', fullPath: '', entry: 'yes' }] }),
    ).toBeNull();
  });

  it('has every route unreached without readable outcomes', () => {
    expect(rows({ ...OUTCOMES, outcomes: 'invalid' }).map(([, , inbound]) => inbound)).toEqual([
      [],
      [],
      [],
      [],
    ]);
  });
});

describe('unfixedOutcomes and joinedOutcome (qits-2049)', () => {
  it('lists the returns and externals, in the manifest’s order', () => {
    const back: DeclaredOutcome = { ...SIGN_OUT, outcome: 'back', kind: 'returnTo', to: null };
    const left: DeclaredOutcome = { ...page('left', 'exit'), kind: 'external', to: 'idp' };
    const manifest: RoutesManifest = {
      ...OUTCOMES,
      outcomes: { declared: [left, ...OUTCOMES_SECTION.declared, back], fired: [] },
    };
    expect(unfixedOutcomes(manifest)).toEqual([left, back]);
    expect(unfixedOutcomes(OUTCOMES)).toEqual([]);
    expect(unfixedOutcomes(RECORDED)).toEqual([]);
  });

  it('joins one declaration as the lists do, the selected route’s freezes first', () => {
    expect(joinedOutcome(OUTCOMES, SIGN_OUT, DETAIL)).toEqual(
      sharedOutcomes(OUTCOMES, DETAIL)[0].outcomes[0],
    );
    expect(joinedOutcome(RECORDED, SIGN_OUT).reachedBy).toEqual([]);
  });
});

/** What `@qits/angular` declares itself and merges into an app that imports it (qits-2044). */
describe('the library’s outcomes (qits-2044)', () => {
  const CALLBACK = 'auth/callback';
  const LIBRARY_FILE = '@qits/angular/src/lib/sign-in/auth-callback.page.ts';
  const declared = (
    interaction: string,
    outcome: string,
    kind: DeclaredOutcome['kind'],
    extra: Partial<DeclaredOutcome> = {},
  ): DeclaredOutcome => ({
    route: CALLBACK,
    interaction,
    outcome,
    kind,
    to: null,
    global: false,
    triggered: false,
    file: LIBRARY_FILE,
    ...extra,
  });
  const SUCCEEDED = declared('sign-in', 'succeeded', 'returnTo');
  const FAILED = declared('sign-in', 'failed', 'stay');
  const RESTARTED = declared('sign-in-failed', 'restarted', 'exit', { to: '', triggered: true });
  const SIGNED_OUT = declared('session-guard', 'signedOut', 'external', {
    route: null,
    global: true,
    to: 'idp',
    file: '@qits/angular/src/lib/sign-in/qits-session.ts',
  });
  const FAILURE = shot(CALLBACK, 'refused', ['sign-in-failed:restarted']);
  const LIBRARY: RoutesManifest = {
    routes: [
      { path: '', fullPath: '' },
      { path: CALLBACK, fullPath: CALLBACK },
    ],
    freezes: [FAILURE],
    byRoute: { [CALLBACK]: [FAILURE.file] },
    outcomes: {
      // The app's own declaration, from a bundle older than `triggered`: read as triggered.
      declared: [SUCCEEDED, FAILED, RESTARTED, SIGNED_OUT, { ...SWITCHED, route: '' }],
      fired: [
        { ...fire('signs in', 'sign-in', 'succeeded', CALLBACK), kind: 'returnTo' },
        { ...fire('refused', 'sign-in', 'failed', CALLBACK, FAILURE.file), kind: 'stay' },
        { ...fire('signs out', 'session-guard', 'signedOut', null), kind: 'external' },
      ],
    },
  };
  const byMark = () =>
    Object.fromEntries(
      [
        ...routeOutcomes(LIBRARY, CALLBACK),
        ...sharedOutcomes(LIBRARY).flatMap((g) => g.outcomes),
      ].map((o) => [o.mark, o]),
    );

  it('reads returnTo and external, triggered or not', () => {
    expect(asManifest(LIBRARY)).toEqual(LIBRARY);
  });

  it('gives a return and an external no route target, and says where they lead', () => {
    const outcomes = byMark();
    expect(outcomes['sign-in:succeeded'].target).toBeNull();
    expect(outcomes['session-guard:signedOut'].target).toBeNull();
    expect(outcomes['sign-in-failed:restarted'].target).toEqual({ kind: 'route', fullPath: '' });
    expect(outcomeLeads(SUCCEEDED)).toBe('returns to the page it started from');
    expect(outcomeLeads(SIGNED_OUT)).toBe('leaves the app for idp');
    expect(outcomeLeads(RESTARTED)).toBeNull();
    expect(outcomeLeads(FAILED)).toBeNull();
  });

  it('reads `triggered`, true when absent', () => {
    const outcomes = byMark();
    expect(outcomes['sign-in:succeeded'].triggered).toBe(false);
    expect(outcomes['session-guard:signedOut'].triggered).toBe(false);
    expect(outcomes['sign-in-failed:restarted'].triggered).toBe(true);
    expect(outcomes['work-tabs:switched'].triggered).toBe(true);
  });

  it('marks what the library declares, by its file', () => {
    const outcomes = byMark();
    expect(outcomes['sign-in:failed'].library).toBe(true);
    expect(outcomes['session-guard:signedOut'].library).toBe(true);
    expect(outcomes['work-tabs:switched'].library).toBe(false);
  });

  it('counts no trigger gap for an untriggered outcome in the tree’s mark (qits-2045)', () => {
    // succeeded and failed are reached and untriggered; restarted is shown but reached by no test.
    expect(routeOutcomeMarks(LIBRARY).get(CALLBACK)).toEqual({ outcomes: 3, gaps: 1 });
    expect(outcomeProgress(LIBRARY, routeTree(LIBRARY))).toEqual({ declaring: 1, pages: 2 });
  });

  it('joins the fires of the new kinds as any other', () => {
    const outcomes = byMark();
    expect(outcomes['sign-in:succeeded'].reachedBy).toEqual([{ spec: SPEC, test: 'signs in' }]);
    expect(outcomes['sign-in:failed'].result).toEqual(FAILURE);
    expect(outcomes['session-guard:signedOut'].reachedBy).toEqual([
      { spec: SPEC, test: 'signs out' },
    ]);
    expect(outcomes['sign-in-failed:restarted'].triggerFreezes).toEqual([FAILURE]);
  });
});
