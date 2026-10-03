import { DOCUMENT } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { client as projectsClient } from '../../api/projects/client.gen';
import { provideHeyApiClient } from '../../api/projects/client/client.gen';
import { goldenMaster } from '../../../testing/golden-masters';
import { AppOrigins, type Backend } from '../platform/app-origins';
import { sessionGuard } from './session.guard';

/** The generated client builds its request after a few awaits; let them run. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('sessionGuard', () => {
  const assign = vi.fn();
  let http: HttpTestingController;
  /** What `AppOrigins` answers: same-origin (`ng serve`) unless a spec names an idp origin. */
  let idpOrigin: string;
  let failed: boolean;

  beforeEach(() => {
    assign.mockReset();
    idpOrigin = '';
    failed = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { location: { assign, host: 'qits.example' } } },
        {
          provide: AppOrigins,
          useValue: {
            origin: (backend: Backend) => (backend === 'idp' ? idpOrigin : ''),
            backendsFailed: () => failed,
          },
        },
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

  it("sends a visitor without a session to the idp's own origin, back to this host", async () => {
    idpOrigin = 'https://idp.qits.example';
    const passed = guard('/qits/work?view=board');
    await settle();
    answer(null, { status: 401, statusText: 'Unauthorized' });
    expect(await passed).toBe(false);
    expect(assign).toHaveBeenCalledWith(
      'https://idp.qits.example/idp/login?return_host=qits.example' +
        `&return_path=${encodeURIComponent('/qits/work?view=board')}`,
    );
  });

  it('lets the page through when the backend origins are not known', async () => {
    failed = true;
    expect(await guard('/')).toBe(true);
    expect(assign).not.toHaveBeenCalled();
    // The store still loads its list on its own; answer it so nothing is left open.
    await settle();
    for (const request of http.match('/projects/api/projects'))
      request.flush(null, { status: 401, statusText: 'Unauthorized' });
  });
});
