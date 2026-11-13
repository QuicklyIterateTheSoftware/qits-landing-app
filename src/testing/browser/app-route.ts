/**
 * Opens a page of the app the way a person sees it, for the page and layout screenshot specs
 * (ticket qits-1997): through the app's own route tree (`app.routes.ts`), at the page's URL, so the
 * shell (`ShellLayout`: top bar, sidebar, breadcrumb, menus) and every layout above the page render
 * around it, and each freeze names the real route.
 *
 * `provideAppRoute()` gives what the frame needs: the real routes, `HttpTestingController`, every
 * generated client the shell and the pages call, fixed platform origins, an event stream that never
 * connects, and a signed-in session, so `qitsSignedInGuard` lets the navigation through. A spec adds
 * its own providers after it (a later provider wins).
 *
 * `openRoute(url, reads)` navigates there and answers the frame's own reads from golden masters
 * (`FrameReads`), and nothing else: a page spec answers only its page's reads. Where a page reads
 * the same thing as the frame (the project list, the project's release requests, its ACTIVE agents,
 * the open workspaces), the helper answers every request for that URL (the page's and the frame's
 * may be two) in the state the spec names, or leaves them all to the spec (`'unanswered'`, which
 * then answers each, `http.match`). The shell is shown in one settled state: the
 * viewport the spec sets, its menus closed. Its own states are `shell.layout.browser.spec.ts`'s.
 */
import {
  EnvironmentProviders,
  inject,
  Injectable,
  Provider,
  reflectComponentType,
  Type,
} from '@angular/core';
import { provideHttpClient, withInterceptors, type HttpInterceptorFn } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QITS_DOMAIN_EVENTS, QitsSession } from '@qits/angular';
import { routes } from '../../app/app.routes';
import { client as artifactsClient } from '../../app/api/artifacts/client.gen';
import { client as ciClient } from '../../app/api/ci/client.gen';
import { client as eventsClient } from '../../app/api/events/client.gen';
import { client as githostClient } from '../../app/api/githost/client.gen';
import { client as maintenanceClient } from '../../app/api/maintenance/client.gen';
import { client as networkAccessClient } from '../../app/api/network-access/client.gen';
import { client as projectsClient } from '../../app/api/projects/client.gen';
import { provideHeyApiClient } from '../../app/api/projects/client/client.gen';
import { client as systemClient } from '../../app/api/system/client.gen';
import { client as workspaceDaemonClient } from '../../app/api/workspace-daemon/client.gen';
import { client as workspacesClient } from '../../app/api/workspaces/client.gen';
import { DomainEvents, EVENT_SOURCE } from '$core/events/domain-events';
import { provideTestPlatformOrigins } from '../platform-origins';
import { finalize } from 'rxjs';
import { goldenMaster } from './golden-master';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** How many requests are sent and not answered yet: the frame's, the page's, any. */
@Injectable()
class OpenRequests {
  count = 0;
}

/** Counts each request as open from its sending until its answer (or its cancelling). */
const countOpenRequests: HttpInterceptorFn = (request, next) => {
  const open = inject(OpenRequests);
  open.count++;
  return next(request).pipe(finalize(() => open.count--));
};

/**
 * The providers a spec opening the app's routes needs, before its own. Configuration only: every
 * backend answer still comes from a golden master.
 */
export function provideAppRoute(): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    OpenRequests,
    provideHttpClient(withInterceptors([countOpenRequests])),
    provideHttpClientTesting(),
    provideHeyApiClient(projectsClient),
    provideHeyApiClient(githostClient),
    provideHeyApiClient(eventsClient),
    provideHeyApiClient(maintenanceClient),
    provideHeyApiClient(workspacesClient),
    provideHeyApiClient(workspaceDaemonClient),
    provideHeyApiClient(ciClient),
    provideHeyApiClient(systemClient),
    provideHeyApiClient(artifactsClient),
    provideHeyApiClient(networkAccessClient),
    provideTestPlatformOrigins(),
    // The live stream never connects: no event reaches a screenshot.
    {
      provide: EVENT_SOURCE,
      useValue: () => ({ onmessage: null, onerror: null, readyState: 0, close: () => {} }),
    },
    // A page's `qitsResource` follows the same stream, as `app.config.ts` provides it.
    { provide: QITS_DOMAIN_EVENTS, useExisting: DomainEvents },
    // Signed in, so `qitsSignedInGuard` passes; no sign-in ever starts.
    { provide: QitsSession, useValue: { ensure: async () => true } },
  ];
}

/**
 * The state each of the frame's reads is answered in: a recorded state of the provider, or
 * `'unanswered'`, which leaves the request to the spec (`'refused'` answers 403 where named).
 */
export interface FrameReads {
  /** qits-projects' `listProjects` (`ProjectsStore`); default `'a project exists'`. */
  readonly projects?: string;
  /**
   * qits-projects' `listProjectReleaseRequests` of the open project (the lightning menu and the
   * sidebar's Release Requests line); default `'a project with no release requests'`.
   */
  readonly releaseRequests?: string;
  /**
   * qits-workspaces' `listAgents` of the open project's ACTIVE agents (the agents menu; the agent
   * layout reads the same), or `'refused'` (403, the default: the menu shows its icon alone).
   */
  readonly agents?: string;
  /**
   * qits-workspaces' `listOpenWorkspaces` (`WorkLayout`'s Workspace links); default
   * `'a project with workspaces bound to work items'`.
   */
  readonly workspaces?: string;
}

/** A frame read: which request it is, and how a state answers it. */
interface FrameRead {
  readonly key: keyof FrameReads;
  readonly fallback: string;
  readonly matches: (url: string) => boolean;
  readonly answer: (state: string) => Promise<object>;
}

const FRAME_READS: readonly FrameRead[] = [
  {
    key: 'projects',
    fallback: 'a project exists',
    matches: (url) => url === '/projects/api/projects',
    answer: (state) => goldenMaster(state, 'listProjects'),
  },
  {
    key: 'releaseRequests',
    fallback: 'a project with no release requests',
    matches: (url) => /^\/projects\/api\/projects\/[^/?]+\/release-requests$/.test(url),
    answer: (state) => goldenMaster(state, 'listProjectReleaseRequests'),
  },
  {
    key: 'agents',
    fallback: 'refused',
    matches: (url) => /^\/workspaces\/api\/agents\?projectId=[^&]+&state=ACTIVE$/.test(url),
    answer: (state) => goldenMaster(state, 'listAgents', 'qits-workspaces'),
  },
  {
    key: 'workspaces',
    fallback: 'a project with workspaces bound to work items',
    matches: (url) => url === '/workspaces/api/work/workspaces',
    answer: (state) => goldenMaster(state, 'listOpenWorkspaces', 'qits-workspaces'),
  },
];

/** A page opened through the app's routes. */
export interface OpenedRoute {
  readonly harness: RouterTestingHarness;
  readonly http: HttpTestingController;
  /** The recorded project (`listProjects`' first entry), whose slug `url` may use. */
  readonly project: RecordedProject;
  /** The shell's host element: what a screenshot of the page shows. */
  readonly frame: HTMLElement;
  /** The routed page's element (the innermost outlet's), for assertions scoped to the page. */
  readonly page: HTMLElement;
  /**
   * Lets the app run, answers every frame read that is open (those its `reads` leave to the spec
   * excepted), and draws. Call it again after answering a read the frame waits on.
   */
  settled(): Promise<void>;
  /**
   * Lets the app run and draws, exactly as `settled()` does, but answers no frame read. For a spec
   * that has already left its page (`leftFor`): the page it left for is not this spec's, so its
   * frame reads (the destination's `WorkLayout`, say) must not be answered from a golden master and
   * noted into the route ledger under this spec's section — they get `leftFor`'s 404 like every
   * other open request (qits-2056).
   */
  idle(): Promise<void>;
}

/** The project a recording names, as far as a spec builds a URL from it. */
export type RecordedProject = {
  readonly id: string;
  readonly slug: string;
  readonly name?: string;
};

/**
 * Navigates the app's routes to `url` (or to what `url` makes of the recorded project), answers
 * the frame's reads (`reads`), and gives the page. Call `provideAppRoute()` in the spec's
 * `TestBed.configureTestingModule` first.
 */
export async function openRoute(
  url: string | ((project: RecordedProject) => string),
  reads: FrameReads = {},
): Promise<OpenedRoute> {
  const http = TestBed.inject(HttpTestingController);
  // The project the URL names: the recorded list's first, also when the spec answers the list.
  const listState =
    reads.projects === undefined || reads.projects === 'unanswered'
      ? 'a project exists'
      : reads.projects;
  const list = (await goldenMaster(listState, 'listProjects')) as {
    entries: { project: RecordedProject }[];
  };
  const project = list.entries[0].project;
  const harness = await RouterTestingHarness.create();
  const settled = () => runToStable(harness, () => answerFrameReads(http, reads));
  const idle = () => runToStable(harness, async () => false);
  await harness.navigateByUrl(typeof url === 'string' ? url : url(project));
  await settled();
  const root = harness.fixture.nativeElement as HTMLElement;
  return {
    harness,
    http,
    project,
    get frame() {
      const shell = root.querySelector<HTMLElement>('app-shell-layout');
      if (!shell) throw new Error('openRoute: the shell did not render');
      return shell;
    },
    get page() {
      return innermostRouted(root);
    },
    settled,
    idle,
  };
}

/**
 * Lets pending async work (request building, navigation) and change detection run, calling
 * `answerRound` each round so a caller can answer whatever reads it opens. A read may follow
 * another's answer (the open project's reads follow the list), so this answers in rounds until a
 * round answers nothing.
 */
async function runToStable(
  harness: RouterTestingHarness,
  answerRound: () => Promise<boolean>,
): Promise<void> {
  for (let round = 0; round < 20; round++) {
    await settle();
    TestBed.tick();
    await settle();
    if (!(await answerRound()) && round >= 2) break;
  }
  await stableOrAwaitingAnswers(harness);
  harness.fixture.detectChanges();
}

/**
 * Waits until the app is stable, or as stable as it gets while a request waits for the spec's
 * answer: a `qitsResource` that is loading is a pending task (Angular's `resource()`), so while its
 * request is open, stability never comes (qits-2143, the Agents page). With a request open, a few
 * turns of the event loop end the wait instead; the spec answers it and calls `settled()` again.
 * With none open, it waits for stability, as before (a lazy page's chunk, a navigation).
 */
async function stableOrAwaitingAnswers(harness: RouterTestingHarness): Promise<void> {
  const open = TestBed.inject(OpenRequests);
  let stable = false;
  const awaitingAnswers = async () => {
    for (let turn = 0; !stable; turn++) {
      await settle();
      if (turn >= 5 && open.count > 0) return;
    }
  };
  await Promise.race([harness.fixture.whenStable().then(() => (stable = true)), awaitingAnswers()]);
  stable = true;
}

/**
 * The element of the innermost routed component below `root`: the deepest activated route that
 * renders a component (a componentless child, `{ path: '', children: [] }`, renders none), found by
 * its selector.
 */
function innermostRouted(root: HTMLElement): HTMLElement {
  let route: ActivatedRoute | null = TestBed.inject(Router).routerState.root;
  let component: Type<unknown> | null = null;
  while (route) {
    if (route.component) component = route.component;
    route = route.firstChild;
  }
  const selector = component && reflectComponentType(component)?.selector;
  const routed = selector ? root.querySelector<HTMLElement>(selector) : null;
  if (!routed) throw new Error('openRoute: no routed component rendered');
  return routed;
}

/** Answers every open frame read its `reads` do not leave to the spec; true if it answered one. */
async function answerFrameReads(http: HttpTestingController, reads: FrameReads): Promise<boolean> {
  let answered = false;
  for (const read of FRAME_READS) {
    const state = reads[read.key] ?? read.fallback;
    if (state === 'unanswered') continue;
    const open: TestRequest[] = http.match(
      (req) => req.method === 'GET' && read.matches(req.urlWithParams),
    );
    for (const request of open) {
      if (request.cancelled) continue;
      if (state === 'refused') {
        request.flush(null, { status: 403, statusText: 'Forbidden' });
      } else {
        request.flush(await read.answer(state));
      }
      answered = true;
    }
  }
  return answered;
}
