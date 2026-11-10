import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideQitsBearerSignIn, QITS_LEAVE_APP, qitsBearerInterceptor } from '@qits/angular';
import { outcomeRecords } from '@qits/angular/testing/browser';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';

/**
 * The bearer interceptor's outcome (qits-2052): when a platform call answers 401 and nothing
 * refreshes the token, `qitsBearerInterceptor` (`@qits/angular`, which `app.config.ts` puts on this
 * app's `HttpClient`) sends the visitor to the idp to sign in again, back to the page they are on,
 * through the declared outcome `session-expired:signedOut` (external `idp`, app-wide,
 * `triggered: false`), which the library merges into this app's outcomes because `app.config.ts`
 * imports the interceptor. The page specs never meet it: their calls answer from golden masters.
 * Here the real `QitsTokens` holds no token (a fresh `sessionStorage`), so the 401 has no refresh
 * and no retry, and `QITS_LEAVE_APP` is a spy, so the tab stays. Nothing is shown, so there is no
 * screenshot.
 */
describe('app config: the bearer interceptor’s expired session (qits-2052)', () => {
  const PLATFORM_DOMAIN = 'qits.example.test';
  const API = '/projects/api/projects';
  let leave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    leave = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        // As `app.config.ts` signs in and signs its calls.
        provideQitsBearerSignIn({
          clientId: 'qits-spa',
          platformDomain: PLATFORM_DOMAIN,
          callbackRoute: false,
        }),
        provideHttpClient(withInterceptors([qitsBearerInterceptor])),
        provideHttpClientTesting(),
        { provide: QITS_LEAVE_APP, useValue: leave },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('session-expired signedOut: a platform call answering 401 leaves for the idp’s sign-in', async () => {
    const http = TestBed.inject(HttpTestingController);
    const answer = firstValueFrom(TestBed.inject(HttpClient).get(API));
    // The interceptor asks `QitsTokens` for the token before it sends the call.
    await vi.waitFor(() =>
      http.expectOne(API).flush(null, { status: 401, statusText: 'Unauthorized' }),
    );
    await expect(answer).rejects.toMatchObject({ status: 401 });
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
        interaction: 'session-expired',
        outcome: 'signedOut',
        kind: 'external',
        to: 'idp',
        url: href,
      }),
    ]);
    // The sign-in comes back to the page the visitor is on.
    const pending = JSON.parse(
      sessionStorage.getItem(`qits.sign-in.qits-spa.pkce.${query.get('state')}`) ?? 'null',
    );
    expect(pending?.returnPath).toBe(`${location.pathname}${location.search}`);
  });
});
