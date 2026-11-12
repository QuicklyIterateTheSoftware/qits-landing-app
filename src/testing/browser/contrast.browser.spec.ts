import { HttpTestingController } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { page } from 'vitest/browser';
import { client as artifactsClient } from '../../app/api/artifacts/client.gen';
import { WEB_SOCKET } from '$core/platform/web-socket';
import { IN_PROGRESS_VIEW_KEY } from '$core/work/in-progress-view';
import { literalDocsPaths } from '$core/ui-builder/docs-paths';
import { provideTestPlatformOrigins } from '../platform-origins';
import { openRoute, provideAppRoute, type OpenedRoute } from './app-route';
import { goldenMaster } from './golden-master';

/**
 * The colour contrast of the app in both schemes (qits-2086): the shell around one page of each
 * kind (a work board in both its views, a release request, the UI builder, network access, an agent's conversation),
 * opened through the app's routes (`openRoute`) and answered from the same golden masters as each
 * page's own screenshot spec. With `data-theme` set to `light`, then `dark`, on `<html>`, axe's
 * `color-contrast` rule (WCAG AA) must find nothing. The page specs show the pixels; this spec shows
 * that the tokens each class names are read by their role.
 *
 * It takes no screenshot: not a page spec (`*.page.browser.spec.ts`), so neither the route ledger
 * nor `qits/page-has-screenshots` reads it, and each page's shots are its own spec's.
 *
 * A failure lists each element axe flagged, its foreground and background and their ratio. A fix
 * picks the class whose token's role fits; a pair that no token of `@qits/ui-components` passes is
 * the library's to fix, excluded below by its exact selector with the token named.
 */

const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

/** Selectors left out of the check, per scheme, each because a library token pair fails. */
const LIBRARY_FAILURES: Record<Scheme, readonly string[]> = { light: [], dark: [] };

/** The page's clock for the cases whose text says how long ago (as their own specs set it). */
const NOW = new Date('2026-01-01T02:00:00Z');

// As `app.config.ts` does: the docs store's paths, with `/` and `@` literal (the UI builder).
if (!artifactsClient.interceptors.request.exists(literalDocsPaths)) {
  artifactsClient.interceptors.request.use(literalDocsPaths);
}

/** One violation's nodes as lines: selector, foreground on background, ratio against expected. */
function describeViolations(results: axe.AxeResults): string[] {
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data = (node.any[0]?.data ?? {}) as {
        fgColor?: string;
        bgColor?: string;
        contrastRatio?: number;
        expectedContrastRatio?: string;
        fontSize?: string;
        fontWeight?: string;
      };
      return (
        `${node.target.join(' ')}: ${data.fgColor} on ${data.bgColor}, ` +
        `${data.contrastRatio} < ${data.expectedContrastRatio} ` +
        `(${data.fontSize}, ${data.fontWeight})`
      );
    }),
  );
}

/** Sets `scheme` on `<html>` and runs axe's `color-contrast` over the shell. */
async function contrastIn(scheme: Scheme, opened: OpenedRoute): Promise<string[]> {
  document.documentElement.setAttribute('data-theme', scheme);
  await opened.settled();
  const results = await axe.run(
    { include: [opened.frame], exclude: [...LIBRARY_FAILURES[scheme]] },
    {
      runOnly: { type: 'rule', values: ['color-contrast'] },
      resultTypes: ['violations'],
      // The UI builder draws freezes in frames of their own: their pixels are the freezes' pages'.
      iframes: false,
    },
  );
  // The rule ran on text: a page that drew none would pass without checking anything.
  expect(
    results.passes.length + results.violations.length,
    `${scheme}: no text checked`,
  ).toBeGreaterThan(0);
  return describeViolations(results);
}

/** A page of each kind: how to open it, answered as its own spec answers it. */
interface Case {
  readonly name: string;
  readonly providers?: (Provider | EnvironmentProviders)[];
  /** Fakes `Date` at {@link NOW}, as the page's own spec does. */
  readonly clock?: boolean;
  show(http: HttpTestingController): Promise<OpenedRoute>;
}

/** Answers every open call with a 404 or 500, in rounds, until none is left open. */
async function failTheRest(http: HttpTestingController, opened: OpenedRoute) {
  for (let round = 0; round < 3; round++) {
    await opened.settled();
    for (const call of http.match(() => true).filter((r) => !r.cancelled)) {
      call.flush(null, { status: 500, statusText: 'Server Error' });
    }
  }
  await opened.settled();
}

/** The In Progress page of the recorded project, its work in every status. */
async function workBoard(http: HttpTestingController): Promise<OpenedRoute> {
  await page.viewport(1040, 3400);
  const opened = await openRoute((project) => `/projects/${project.slug}/work/in-progress`);
  http
    .expectOne('/workspaces/api/agents?state=ACTIVE')
    .flush(
      await goldenMaster(
        'a project with agents bound to work items',
        'listAgents',
        'qits-workspaces',
      ),
    );
  http
    .expectOne(`/projects/api/projects/${opened.project.id}/work`)
    .flush(await goldenMaster('a project with work in every status', 'listProjectWork'));
  await opened.settled();
  return opened;
}

const CASES: Case[] = [
  {
    // As work-in-progress.page.browser.spec.ts: the epic boards, then the tickets' board.
    name: 'a work board (In Progress, epic boards)',
    show: (http) => workBoard(http),
  },
  {
    // As work-in-progress.page.browser.spec.ts's `inline`: the one board, its epics' lanes inline.
    name: 'a work board (In Progress, inline)',
    show: (http) => {
      localStorage.setItem(IN_PROGRESS_VIEW_KEY, 'inline');
      return workBoard(http);
    },
  },
  {
    // As release-request.page.browser.spec.ts's `pending`: head, facts, Approve and Decline.
    name: 'a release request awaiting approval',
    clock: true,
    providers: [provideTestPlatformOrigins({}, { ci: 'https://ci.test' })],
    async show(http) {
      await page.viewport(1140, 2400);
      const state = 'a release request awaiting approval';
      const recorded = await goldenMaster(state, 'getReleaseRequest');
      const { id, repoId } = recorded.request;
      const opened = await openRoute(
        (project) => `/projects/${project.slug}/release-requests/${encodeURIComponent(id)}`,
      );
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
        .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
      await opened.settled();
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/release-requests/${id}`)
        .flush(recorded);
      await opened.settled();
      const base = `/projects/api/repositories/${repoId}/release-requests/${id}`;
      http
        .expectOne(`${base}/approval-eligibility`)
        .flush(await goldenMaster(state, 'getReleaseRequestApprovalEligibility'));
      http
        .expectOne(`${base}/commits`)
        .flush(await goldenMaster(state, 'listReleaseRequestCommits'));
      if (recorded.request.mergedSha) {
        http
          .expectOne(
            `/projects/api/repositories/${repoId}/commits/${recorded.request.mergedSha}/builds`,
          )
          .flush(await goldenMaster(state, 'listCommitBuilds'));
      }
      // qits-ci's runs and reports: an error, as the page's own spec answers them.
      await failTheRest(http, opened);
      return opened;
    },
  },
  {
    // As release-request.page.browser.spec.ts's `refolded-graph`: the fold's commit graph.
    name: 'a refolded release request’s commit graph',
    clock: true,
    providers: [provideTestPlatformOrigins({}, { ci: 'https://ci.test' })],
    async show(http) {
      await page.viewport(1140, 2400);
      const state = 'a refolded release request';
      const recorded = await goldenMaster(state, 'getReleaseRequest');
      const { id, repoId } = recorded.request;
      const opened = await openRoute(
        (project) =>
          `/projects/${project.slug}/release-requests/${encodeURIComponent(id)}?tab=commits`,
      );
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
        .flush(await goldenMaster('a project with 3 repositories', 'listProjectRepositories'));
      await opened.settled();
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/release-requests/${id}`)
        .flush(recorded);
      await opened.settled();
      const base = `/projects/api/repositories/${repoId}/release-requests/${id}`;
      http
        .expectOne(`${base}/commits`)
        .flush(await goldenMaster(state, 'listReleaseRequestCommits'));
      if (recorded.request.mergedSha) {
        http
          .expectOne(
            `/projects/api/repositories/${repoId}/commits/${recorded.request.mergedSha}/builds`,
          )
          .flush(await goldenMaster(state, 'listCommitBuilds'));
      }
      await failTheRest(http, opened);
      return opened;
    },
  },
  {
    // As ui-builder.page.browser.spec.ts's `loaded`: the route tree, a route's states and calls.
    name: 'the UI builder',
    async show(http) {
      await page.viewport(1520, 800);
      const bundle = 'a published routes bundle';
      const opened = await openRoute(
        (project) => `/projects/${project.slug}/repositories/qits-landing-app/ui-builder`,
      );
      http
        .expectOne(`/projects/api/projects/${opened.project.id}/repositories`)
        .flush(
          await goldenMaster(
            'a project with repositories in components',
            'listProjectRepositories',
          ),
        );
      http
        .expectOne('/artifacts/docs/docs')
        .flush(await goldenMaster(bundle, 'listDocsSites', 'qits-artifacts'));
      await opened.settled();
      http
        .expectOne((req) => req.url.endsWith('/artifacts/docs/docs/@routes/qits-landing'))
        .flush(await goldenMaster(bundle, 'listDocsVersions', 'qits-artifacts'));
      await opened.settled();
      http
        .expectOne((req) => req.url.endsWith('/manifest.json'))
        .flush(await goldenMaster(bundle, 'getDocsFile', 'qits-artifacts'));
      await opened.settled();
      http
        .expectOne('/artifacts/docs/docs')
        .flush(await goldenMaster(bundle, 'listDocsSites', 'qits-artifacts'));
      await opened.settled();
      // A freeze and the bundle's assets: no recording holds their bytes; left unanswered.
      http.match((req) => req.url.includes('/-/'));
      return opened;
    },
  },
  {
    // As network-access.page.browser.spec.ts's `loaded`, with the top bar's theme menu open.
    name: 'network access, the theme menu open',
    async show(http) {
      await page.viewport(1140, 900);
      const opened = await openRoute('/network-access');
      http
        .expectOne('/network-access/api/peers')
        .flush(
          await goldenMaster(
            'a device peer behind an announced private edge',
            'getPeers',
            'qits-network-access',
          ),
        );
      http
        .expectOne('/network-access/api/nodes')
        .flush(await goldenMaster('a joined node', 'getNodes', 'qits-network-access'));
      http
        .expectOne('/network-access/api/private-edge')
        .flush(
          await goldenMaster('an announced private edge', 'getPrivateEdge', 'qits-network-access'),
        );
      await opened.settled();
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await expect.element(page.getByRole('radio', { name: 'System' })).toBeVisible();
      return opened;
    },
  },
  {
    // As agent-chat.page.browser.spec.ts's `transcript`: the agent's turns and its prompt draft.
    name: 'an agent’s conversation',
    clock: true,
    providers: [
      provideTestPlatformOrigins({ workspaces: 'https://workspaces.test' }),
      {
        provide: WEB_SOCKET,
        useValue: () => {
          throw new Error('the Chat tab opens no socket');
        },
      },
    ],
    async show(http) {
      await page.viewport(1140, 1300);
      const drafted = 'an agent with a saved prompt draft';
      const agent = await goldenMaster(drafted, 'getAgent', 'qits-workspaces');
      const opened = await openRoute(
        (project) => `/projects/${project.slug}/agents/${agent.agentId}/chat`,
        { agents: 'an agent whose workspace is starting' },
      );
      http.expectOne(`/workspaces/api/agents/${agent.agentId}`).flush(agent);
      await opened.settled();
      http
        .expectOne(`/workspaces/api/agents/${agent.agentId}/active-process`)
        .flush(
          await goldenMaster(
            'a workspace slot hosting agents',
            'getAgentActiveProcess',
            'qits-workspaces',
          ),
        );
      await opened.settled();
      http
        .expectOne(
          `https://workspaces.test/workspaces/agent/${agent.agentId}/log?channel=TRANSCRIPT`,
        )
        .flush(
          await goldenMaster(
            'a workspace daemon with an agent that has taken turns',
            'getCommandLog',
            'qits-workspace-daemon',
          ),
        );
      http
        .expectOne(`/workspaces/api/agents/${agent.agentId}/prompt-draft`)
        .flush(await goldenMaster(drafted, 'getAgentPromptDraft', 'qits-workspaces'));
      await opened.settled();
      await expect
        .element(page.elementLocator(opened.page).getByText('Fixed: the user name is trimmed'))
        .toBeVisible();
      return opened;
    },
  },
];

describe('Colour contrast, light and dark (axe color-contrast)', () => {
  afterEach(async () => {
    vi.useRealTimers();
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem(IN_PROGRESS_VIEW_KEY);
    TestBed.inject(HttpTestingController).match(() => true);
    await page.viewport(800, 600);
  });

  for (const shown of CASES) {
    it(`finds no contrast failure on ${shown.name}`, async () => {
      if (shown.clock) vi.useFakeTimers({ toFake: ['Date'], now: NOW });
      TestBed.configureTestingModule({
        providers: [provideAppRoute(), ...(shown.providers ?? [])],
      });
      const http = TestBed.inject(HttpTestingController);
      const opened = await shown.show(http);
      for (const scheme of SCHEMES) {
        const failures = await contrastIn(scheme, opened);
        expect
          .soft(failures, `${shown.name}, ${scheme}: ${failures.length} contrast failures`)
          .toEqual([]);
      }
    });
  }
});
