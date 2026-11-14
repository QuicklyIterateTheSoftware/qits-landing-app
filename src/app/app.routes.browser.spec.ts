import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsBearerSignIn, QITS_LEAVE_APP, QITS_SIGN_IN_FETCH } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { page } from 'vitest/browser';
import { routes } from './app.routes';

/**
 * The session guard's outcome (qits-2044): `qitsSignedInGuard` (`@qits/angular`'s `QitsSession`)
 * in front of the shell sends a visitor who holds no token to the idp, through the declared outcome
 * `session-guard:signedOut` (external `idp`, app-wide, `triggered: false`), which the library merges
 * into this app's outcomes because `app.routes.ts` imports the guard. The page specs never meet it:
 * `provideAppRoute()` signs everyone in. Here the real `QitsSession` and `QitsTokens` hold no token
 * (a fresh `sessionStorage`), and `QITS_LEAVE_APP` is a spy, so the tab stays. Nothing is shown,
 * so there is no screenshot.
 */
describe('app routes: the session guard (qits-2044)', () => {
  const PLATFORM_DOMAIN = 'qits.example.test';
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    leave = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // As `app.config.ts` signs in.
        provideQitsBearerSignIn({
          clientId: 'qits-spa',
          platformDomain: PLATFORM_DOMAIN,
          callbackRoute: false,
        }),
        { provide: QITS_LEAVE_APP, useValue: leave },
      ],
    });
  });

  afterEach(() => sessionStorage.clear());

  it('session-guard signedOut: a visitor holding no token leaves for the idp’s sign-in', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects');
    await vi.waitFor(() => expect(leave).toHaveBeenCalled());
    expect(leave).toHaveBeenCalledTimes(1);
    const [href] = leave.mock.calls[0] as [string];
    const authorize = `https://idp.${PLATFORM_DOMAIN}/idp/authorize?`;
    expect(href.startsWith(authorize)).toBe(true);
    const query = new URLSearchParams(href.slice(authorize.length));
    expect(query.get('client_id')).toBe('qits-spa');
    expect(query.get('redirect_uri')).toBe(`${location.origin}/auth/callback`);
    expect(outcomeRecords()).toEqual([
      expect.objectContaining({
        interaction: 'session-guard',
        outcome: 'signedOut',
        kind: 'external',
        to: 'idp',
        url: href,
      }),
    ]);
    // The sign-in comes back to the page the visitor asked for.
    const pending = JSON.parse(
      sessionStorage.getItem(`qits.sign-in.qits-spa.pkce.${query.get('state')}`) ?? 'null',
    );
    expect(pending?.returnPath).toBe('/projects');
    // The guard refused the navigation: no page of the shell opened.
    expect(TestBed.inject(Router).url).toBe('/');
  });
});

/**
 * The guard's other outcome (qits-2250): a visitor holding tokens whose access token has expired,
 * on a tab whose idp does not answer the refresh (its gateway's 502), is not sent to the idp's
 * authorize page, which would not answer either and showed an empty 502. `QitsSession` answers the
 * guard with the callback page's `UrlTree`, `/auth/callback?error=temporarily_unavailable`, through
 * the declared outcome `session-guard:unavailable` (an exit to `auth/callback`, app-wide,
 * `triggered: false`), which the library merges into this app's outcomes beside `signedOut`.
 *
 * The callback page reads the idp's query from the document's location, not from the router, and
 * TestBed's default `PlatformLocation` is a mock that never touches it: this case runs the
 * browser's own, so the redirect lands in the address bar as it does in the app and the page says
 * what it says there. Nothing is screenshot: the page's look is the callback spec's `unavailable`.
 */
describe('app routes: the session guard with the idp unavailable (qits-2250)', () => {
  const PLATFORM_DOMAIN = 'qits.example.test';
  const UNAVAILABLE = '/auth/callback?error=temporarily_unavailable';
  let leave: ReturnType<typeof vi.fn>;
  let idp: ReturnType<typeof vi.fn>;
  let logged: ReturnType<typeof vi.spyOn>;

  /** A JWT whose payload names `sub`, as `QitsTokens` decodes it (unverified). */
  function jwt(sub: string): string {
    const part = (value: object) =>
      btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${part({ alg: 'none' })}.${part({ sub })}.signature`;
  }

  beforeEach(() => {
    sessionStorage.clear();
    // Kept from an earlier sign-in: the access token expired, the refresh token still good, so the
    // guard's `accessToken()` asks the idp to refresh.
    sessionStorage.setItem(
      'qits.sign-in.qits-spa.tokens',
      JSON.stringify({
        accessToken: jwt('visitor'),
        accessExpiresAt: Date.now() - 60_000,
        refreshToken: 'refresh-token',
        refreshExpiresAt: Date.now() + 3_600_000,
      }),
    );
    leave = vi.fn();
    // The callback page logs the technical reason it failed; kept out of the run's output.
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The idp's gateway, with the idp behind it down.
    idp = vi.fn(async () => new Response('', { status: 502 }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // As `app.config.ts` signs in.
        provideQitsBearerSignIn({
          clientId: 'qits-spa',
          platformDomain: PLATFORM_DOMAIN,
          callbackRoute: false,
        }),
        { provide: QITS_SIGN_IN_FETCH, useValue: idp },
        { provide: QITS_LEAVE_APP, useValue: leave },
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
      ],
    });
  });

  afterEach(() => {
    logged.mockRestore();
    history.replaceState({}, '', '/');
    sessionStorage.clear();
  });

  it('session-guard unavailable: an unanswered refresh lands on the callback page saying so, and never leaves', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projects');
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe(UNAVAILABLE));
    harness.fixture.detectChanges();
    // The guard asked the idp, as a refresh, and got no answer worth leaving for.
    expect(idp).toHaveBeenCalled();
    const [url, init] = idp.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://idp.${PLATFORM_DOMAIN}/idp/token`);
    expect(new URLSearchParams(String(init.body)).get('grant_type')).toBe('refresh_token');
    const view = page.elementLocator(harness.routeNativeElement as HTMLElement);
    await expect.element(view.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible();
    await expect
      .element(
        view.getByText('The sign-in service cannot be reached right now. Try again in a moment.'),
      )
      .toBeVisible();
    await expect
      .element(view.getByRole('link', { name: 'Start again' }))
      .toHaveAttribute('data-qits-outcome', 'sign-in-failed:restarted');
    expect(logged).toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
    expect(outcomeRecords()).toEqual([
      expect.objectContaining({
        interaction: 'session-guard',
        outcome: 'unavailable',
        kind: 'exit',
        to: 'auth/callback',
        url: UNAVAILABLE,
      }),
      // The callback page's own stay, saying so.
      expect.objectContaining({ interaction: 'sign-in', outcome: 'failed', kind: 'stay' }),
    ]);
    // The outage kept the tokens: Start again reruns the guard, which retries the refresh.
    expect(
      JSON.parse(sessionStorage.getItem('qits.sign-in.qits-spa.tokens') ?? '{}').refreshToken,
    ).toBe('refresh-token');
  });
});
