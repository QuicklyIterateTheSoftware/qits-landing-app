import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SignInCallback } from '$core/auth/session';
import { AuthCallbackPage } from './auth-callback.page';

/** The page's work runs after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('AuthCallbackPage', () => {
  let navigate: ReturnType<typeof vi.spyOn>;

  function open(callback?: SignInCallback) {
    history.replaceState({}, '', '/auth/callback?code=C&state=S');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        ...(callback ? [{ provide: SignInCallback, useValue: callback }] : []),
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    TestBed.createComponent(AuthCallbackPage);
  }

  afterEach(() => history.replaceState({}, '', '/'));

  it('finishes the sign-in with the query and goes on to the path it answers', async () => {
    const complete = vi.fn(async (_query: URLSearchParams) => '/projects/qits');
    open({ complete });
    await settle();
    expect(complete.mock.calls[0][0].toString()).toBe('code=C&state=S');
    expect(navigate).toHaveBeenCalledWith('/projects/qits', { replaceUrl: true });
  });

  it('stays put when the sign-in fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    open({ complete: async () => Promise.reject(new Error('refused')) });
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('goes on to the root where nothing signs in this way (deployed)', async () => {
    open();
    await settle();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });
});
