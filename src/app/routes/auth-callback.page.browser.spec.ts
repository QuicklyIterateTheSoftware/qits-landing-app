import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  provideQitsBearerSignIn,
  QITS_SIGN_IN_FETCH,
  QitsSession,
  QitsSignInError,
  QitsTokens,
  type QitsSignInFailure,
} from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { routes } from '../app.routes';
import { goldenMaster } from '../../testing/browser/golden-master';

/**
 * Screenshots of the sign-in callback page (`@qits/angular`'s `QitsAuthCallbackPage`, placed at
 * `auth/callback` by `qitsAuthCallbackRoute`): signing in while `complete()` is in flight, and
 * failed for each reason a `QitsSignInError` names. It is opened through the app's own routes
 * (qits-1997), where `auth/callback` sits outside the shell, so no shell renders around it. The
 * page reads the query from the document's location, not from the router, so the test puts it in
 * the address bar first.
 *
 * The page's outcomes are the library's own (qits-2044), merged into this app's because
 * `app.routes.ts` imports `qitsAuthCallbackRoute`: `sign-in:succeeded` (a return to the path the
 * sign-in started from), `sign-in:failed` (a stay) and `sign-in-failed:restarted` (the Start again
 * link, an exit to `/`). The failures stub `QitsTokens.complete()`; the success runs the real
 * `QitsTokens`, its pending sign-in seeded as `authorizeUrl()` keeps it and the code swap answered
 * with qits-idp's recorded token answer.
 */

/** The page's `complete()` rejection runs after a few microtasks; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CALLBACK = '/auth/callback?code=C&state=S';

/** The callback page, routed at `auth/callback` with the idp's query. */
async function render() {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(CALLBACK);
  await settle();
  harness.fixture.detectChanges();
  return harness;
}

/** The routed page. */
function view(harness: RouterTestingHarness) {
  return page.elementLocator(harness.routeNativeElement as HTMLElement);
}

/** The outcomes the test reached, as `interaction:outcome kind url`. */
const reached = () =>
  outcomeRecords().map((r) => `${r.interaction}:${r.outcome} ${r.kind} ${r.url ?? '-'}`);

describe('QitsAuthCallbackPage (screenshots)', () => {
  let complete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    complete = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: QitsTokens, useValue: { complete } },
        // Start again goes to `/`, behind `qitsSignedInGuard`: the visitor is not signed in, and
        // the sign-in it would start is the session guard spec's (`app.routes.browser.spec.ts`).
        { provide: QitsSession, useValue: { ensure: async () => false } },
      ],
    });
    history.replaceState({}, '', CALLBACK);
  });

  afterEach(() => history.replaceState({}, '', '/'));

  it('shows that the visitor is being signed in', async () => {
    // The sign-in stays in flight for the screenshot.
    complete.mockReturnValue(new Promise<string>(() => undefined));
    const harness = await render();
    const element = view(harness);
    await expect.element(element.getByRole('status')).toHaveTextContent('Signing you in…');
    await expect.element(element).toMatchScreenshot('signing-in', { kind: 'PENDING' });
    expect(reached()).toEqual([]);
  });

  const failures: readonly { reason: QitsSignInFailure; technical: string; shown: string }[] = [
    {
      reason: 'refused',
      technical: 'The idp refused the sign-in: access_denied The user denied the request.',
      shown: 'The sign-in service refused the sign-in.',
    },
    {
      reason: 'unknown-state',
      technical: 'The sign-in came back with a state this tab did not start.',
      shown: 'This sign-in was started in another tab, or by an old link.',
    },
    {
      reason: 'no-code',
      technical: 'The sign-in came back without a code.',
      shown: 'The sign-in came back incomplete.',
    },
    {
      reason: 'not-swapped',
      technical: 'The idp answered the code swap with 400 invalid_grant.',
      shown: 'The sign-in could not be finished: its code was wrong, already used or expired.',
    },
  ];

  /** The page after `complete()` rejected for `reason`, its failure shown. */
  async function failed(reason: QitsSignInFailure, technical: string) {
    complete.mockRejectedValue(new QitsSignInError(reason, technical));
    const harness = await render();
    await settle();
    harness.fixture.detectChanges();
    return harness;
  }

  for (const { reason, technical, shown } of failures) {
    it(`sign-in failed: stays and shows that the sign-in failed: ${reason}`, async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const element = view(await failed(reason, technical));
        await expect
          .element(element.getByRole('heading', { name: 'Sign-in failed' }))
          .toBeVisible();
        await expect.element(element.getByText(shown)).toBeVisible();
        await expect
          .element(element.getByRole('link', { name: 'Start again' }))
          .toHaveAttribute('data-qits-outcome', 'sign-in-failed:restarted');
        expect(logged).toHaveBeenCalled();
        expect(reached()).toEqual(['sign-in:failed stay -']);
        await expect.element(element).toMatchScreenshot(reason, { kind: 'ERROR' });
      } finally {
        logged.mockRestore();
      }
    });
  }

  it('sign-in-failed restarted: Start again goes to the root', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const harness = await failed('refused', failures[0].technical);
      await view(harness).getByRole('link', { name: 'Start again' }).click();
      await settle();
      expect(reached()).toEqual(['sign-in:failed stay -', 'sign-in-failed:restarted exit /']);
    } finally {
      logged.mockRestore();
    }
  });
});

describe('QitsAuthCallbackPage signing in (qits-2044)', () => {
  /** The idp's client and its domain; `QitsTokens` keys the pending sign-in by the client. */
  const CLIENT_ID = 'qits-spa';
  const PLATFORM_DOMAIN = 'qits.example.test';
  /** The pending sign-in `authorizeUrl('/projects')` keeps for the state `S`. */
  const PENDING_KEY = `qits.sign-in.${CLIENT_ID}.pkce.S`;
  const VERIFIER = 'contract-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';

  let swap: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ verifier: VERIFIER, returnPath: '/projects' }),
    );
    // The token endpoint answers with qits-idp's recorded token answer, as it is.
    swap = vi.fn(
      async () =>
        new Response(
          JSON.stringify(
            await goldenMaster('an authorization code issued to the CLI', 'issueToken', 'qits-idp'),
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // As `app.config.ts` signs in, the callback route placed by `app.routes.ts`.
        provideQitsBearerSignIn({
          clientId: CLIENT_ID,
          platformDomain: PLATFORM_DOMAIN,
          callbackRoute: false,
        }),
        { provide: QITS_SIGN_IN_FETCH, useValue: swap },
        // The return enters the shell behind `qitsSignedInGuard`, whose own screenshots are the
        // page specs'; here the navigation stops at the guard.
        { provide: QitsSession, useValue: { ensure: async () => false } },
      ],
    });
    history.replaceState({}, '', CALLBACK);
  });

  afterEach(() => {
    history.replaceState({}, '', '/');
    sessionStorage.clear();
  });

  it('sign-in succeeded: swaps the code and returns to the page the sign-in started from', async () => {
    await render();
    await vi.waitFor(() => expect(outcomeRecords()).toHaveLength(1));
    expect(swap).toHaveBeenCalledTimes(1);
    const [url, init] = swap.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://idp.${PLATFORM_DOMAIN}/idp/token`);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: 'C',
      redirect_uri: `${location.origin}/auth/callback`,
      code_verifier: VERIFIER,
    });
    expect(outcomeRecords()[0]).toMatchObject({
      interaction: 'sign-in',
      outcome: 'succeeded',
      kind: 'returnTo',
      url: '/projects',
    });
    // The pending sign-in is spent, and the tokens are kept.
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(await TestBed.inject(QitsTokens).accessToken()).toBe('opaque');
    expect(TestBed.inject(Router).url).not.toBe('/projects');
  });
});
