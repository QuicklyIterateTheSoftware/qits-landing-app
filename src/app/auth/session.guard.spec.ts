import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { client as projectsClient } from '../api/projects/client.gen';
import { provideHeyApiClient } from '../api/projects/client/client.gen';
import { goldenMaster } from '../../testing/golden-masters';
import { sessionGuard } from './session.guard';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('sessionGuard', () => {
  const assign = vi.fn();
  let http: HttpTestingController;

  beforeEach(() => {
    assign.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { location: { assign } } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideHeyApiClient(projectsClient),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function guard(url: string) {
    return TestBed.runInInjectionContext(() =>
      sessionGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
  }

  /**
   * Answers every list request. The guard asks one; the store it injects starts its own list load
   * in the browser, which gets the same answer.
   */
  function answer(...args: Parameters<ReturnType<HttpTestingController['expectOne']>['flush']>) {
    const requests = http.match('/projects/api/projects');
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) request.flush(...args);
  }

  it('lets a visitor with a session through', async () => {
    const passed = guard('/');
    await settle();
    answer(goldenMaster('a project exists', 'listProjects'));
    expect(await passed).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });

  it('sends a visitor without a session to the login page, and back to `/?`', async () => {
    const passed = guard('/');
    await settle();
    answer(null, { status: 401, statusText: 'Unauthorized' });
    expect(await passed).toBe(false);
    expect(assign).toHaveBeenCalledWith(`/idp/login?redirect=${encodeURIComponent('/?')}`);
  });
});
