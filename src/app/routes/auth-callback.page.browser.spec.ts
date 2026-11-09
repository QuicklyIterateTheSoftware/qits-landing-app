import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { QitsSignInError, QitsTokens, type QitsSignInFailure } from '@qits/angular';
import { page } from 'vitest/browser';
import { routes } from '../app.routes';

/**
 * Screenshots of the sign-in callback page (`@qits/angular`'s `QitsAuthCallbackPage`, placed at
 * `auth/callback` by `qitsAuthCallbackRoute`): signing in while `complete()` is in flight, and
 * failed for each reason a `QitsSignInError` names. It is opened through the app's own routes
 * (qits-1997), where `auth/callback` sits outside the shell, so no shell renders around it. The
 * page calls no backend itself, so there is no golden master: `QitsTokens` answers `complete()`
 * directly. The page reads the query from
 * the document's location, not from the router, so the test puts it in the address bar first.
 */

/** The page's `complete()` rejection runs after a few microtasks; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const CALLBACK = '/auth/callback?code=C&state=S';

describe('QitsAuthCallbackPage (screenshots)', () => {
  let complete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    complete = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: QitsTokens, useValue: { complete } }],
    });
    history.replaceState({}, '', CALLBACK);
  });

  afterEach(() => history.replaceState({}, '', '/'));

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

  it('shows that the visitor is being signed in', async () => {
    // The sign-in stays in flight for the screenshot.
    complete.mockReturnValue(new Promise<string>(() => undefined));
    const harness = await render();
    const element = view(harness);
    await expect.element(element.getByRole('status')).toHaveTextContent('Signing you in…');
    await expect.element(element).toMatchScreenshot('signing-in');
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

  for (const { reason, technical, shown } of failures) {
    it(`shows that the sign-in failed: ${reason}`, async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        complete.mockRejectedValue(new QitsSignInError(reason, technical));
        const harness = await render();
        await settle();
        harness.fixture.detectChanges();
        const element = view(harness);
        await expect
          .element(element.getByRole('heading', { name: 'Sign-in failed' }))
          .toBeVisible();
        await expect.element(element.getByText(shown)).toBeVisible();
        await expect.element(element.getByRole('link', { name: 'Start again' })).toBeVisible();
        expect(logged).toHaveBeenCalled();
        await expect.element(element).toMatchScreenshot(reason);
      } finally {
        logged.mockRestore();
      }
    });
  }
});
