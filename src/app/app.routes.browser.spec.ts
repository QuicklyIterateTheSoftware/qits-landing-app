import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideQitsBearerSignIn, QITS_LEAVE_APP } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
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
